import {
  assertSupportedJsonSchema,
  JsonSchemaError,
  validateJsonSchemaValue,
  type JsonSchemaNode,
} from '@deepseek-ai/dsh-tools'

interface PreparedNumericBoundsSchema {
  readonly raw: unknown
  readonly dsh: JsonSchemaNode
}

function hasIntrinsicConstructor(prototype: object, name: 'Array' | 'Object'): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor')
  const constructor: unknown = descriptor?.value
  if (typeof constructor !== 'function') return false
  try {
    return constructor.name === name
      && constructor.prototype === prototype
      && Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`
  } catch {
    return false
  }
}

function isIntrinsicObjectPrototype(value: object): boolean {
  return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor(value, 'Object')
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    const prototype: unknown = Object.getPrototypeOf(value)
    const plainPrototype = prototype === null
      || typeof prototype === 'object'
        && prototype !== null
        && isIntrinsicObjectPrototype(prototype)
    if (!plainPrototype) return false
    return Reflect.ownKeys(value)
      .every(key => typeof key === 'string' && Object.prototype.propertyIsEnumerable.call(value, key))
  } catch {
    return false
  }
}

function isPlainArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false
  try {
    const prototype: unknown = Object.getPrototypeOf(value)
    if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, 'Array')) return false
    const objectPrototype: unknown = Object.getPrototypeOf(prototype)
    if (typeof objectPrototype !== 'object' || objectPrototype === null || !isIntrinsicObjectPrototype(objectPrototype)) {
      return false
    }
    if (Reflect.ownKeys(value).length !== value.length + 1) return false
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) return false
    }
    return true
  } catch {
    return false
  }
}

function isLosslessJsonNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)
}

function sanitizeNumericBoundsSchema(
  root: unknown,
  violations: string[],
): unknown {
  const clones = new Map<object, unknown>()

  const visit = (node: unknown, path: string): unknown => {
    if (!isPlainRecord(node)) return node

    const known = clones.get(node)
    if (known !== undefined) return known

    const clone: Record<string, unknown> = {}
    clones.set(node, clone)

    const hasMinimum = Object.hasOwn(node, 'minimum')
    const hasMaximum = Object.hasOwn(node, 'maximum')
    if (hasMinimum || hasMaximum) {
      if (node.type !== 'number' && node.type !== 'integer') {
        if (hasMinimum) violations.push(`${path}.minimum is supported only on type "number" or "integer"`)
        if (hasMaximum) violations.push(`${path}.maximum is supported only on type "number" or "integer"`)
      }

      if (hasMinimum && !isLosslessJsonNumber(node.minimum)) {
        violations.push(`${path}.minimum must be a finite lossless JSON number`)
      }
      if (hasMaximum && !isLosslessJsonNumber(node.maximum)) {
        violations.push(`${path}.maximum must be a finite lossless JSON number`)
      }
      if (
        hasMinimum
        && hasMaximum
        && isLosslessJsonNumber(node.minimum)
        && isLosslessJsonNumber(node.maximum)
        && node.minimum > node.maximum
      ) {
        violations.push(`${path}.minimum must be less than or equal to ${path}.maximum`)
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'minimum' || key === 'maximum') continue

      if (key === 'properties' && isPlainRecord(value)) {
        const properties: Record<string, unknown> = {}
        for (const [property, child] of Object.entries(value)) {
          properties[property] = visit(child, `${path}.properties.${property}`)
        }
        clone[key] = properties
        continue
      }

      if (key === 'items') {
        clone[key] = visit(value, `${path}.items`)
        continue
      }

      if (key === 'oneOf' && isPlainArray(value)) {
        clone[key] = value.map((branch, index) => visit(branch, `${path}.oneOf[${index}]`))
        continue
      }

      clone[key] = value
    }

    return clone
  }

  return visit(root, 'schema')
}

export function prepareNumericBoundsSchema(raw: unknown): PreparedNumericBoundsSchema {
  const violations: string[] = []
  const sanitized = sanitizeNumericBoundsSchema(raw, violations)
  if (violations.length > 0) throw new JsonSchemaError(violations)

  assertSupportedJsonSchema(sanitized)
  return { raw, dsh: sanitized }
}

function propertyPath(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`
}

function diagnosticPath(path: string): string {
  return path === '' ? 'arguments' : path
}

function shallowContainerSchema(schema: JsonSchemaNode): JsonSchemaNode {
  if (schema.type === 'object' && schema.properties !== undefined) {
    return {
      ...schema,
      properties: Object.fromEntries(
        Object.keys(schema.properties).map(key => [key, {}]),
      ),
    }
  }

  if (schema.type === 'array' && schema.items !== undefined) {
    return { ...schema, items: {} }
  }

  return schema
}

function validateNode(
  raw: unknown,
  schema: JsonSchemaNode,
  value: unknown,
  path: string,
): string[] {
  const rawNode = isPlainRecord(raw) ? raw : {}

  if (schema.oneOf !== undefined) {
    const rawBranches = isPlainArray(rawNode.oneOf) ? rawNode.oneOf : []
    let matches = 0

    for (let index = 0; index < schema.oneOf.length; index += 1) {
      const branch = schema.oneOf[index]
      if (branch === undefined) continue
      const branchRaw = rawBranches[index]
      if (validateNode(branchRaw, branch, value, path).length === 0) matches += 1
    }

    return matches === 1
      ? []
      : [`"${diagnosticPath(path)}" must match exactly one oneOf branch (matched ${matches})`]
  }

  const baseViolations = validateJsonSchemaValue(shallowContainerSchema(schema), value, path)
  if (baseViolations.length > 0) return baseViolations

  const violations: string[] = []
  if ((schema.type === 'number' || schema.type === 'integer') && typeof value === 'number') {
    const minimum = Object.hasOwn(rawNode, 'minimum') ? rawNode.minimum : undefined
    const maximum = Object.hasOwn(rawNode, 'maximum') ? rawNode.maximum : undefined

    if (typeof minimum === 'number' && value < minimum) {
      violations.push(`"${diagnosticPath(path)}" must be greater than or equal to ${minimum}`)
    }
    if (typeof maximum === 'number' && value > maximum) {
      violations.push(`"${diagnosticPath(path)}" must be less than or equal to ${maximum}`)
    }
  }

  if (schema.type === 'object' && isPlainRecord(value) && schema.properties !== undefined) {
    const rawProperties = isPlainRecord(rawNode.properties) ? rawNode.properties : {}
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (!Object.hasOwn(value, key) || value[key] === undefined) continue
      const childRaw = rawProperties[key]
      violations.push(...validateNode(
        childRaw,
        childSchema,
        value[key],
        propertyPath(path, key),
      ))
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items !== undefined) {
    const rawItems = Object.hasOwn(rawNode, 'items') ? rawNode.items : undefined
    for (let index = 0; index < value.length; index += 1) {
      violations.push(...validateNode(
        rawItems,
        schema.items,
        value[index],
        `${path}[${index}]`,
      ))
    }
  }

  return violations
}

export function validateNumericBoundsSchemaValue(
  prepared: PreparedNumericBoundsSchema,
  value: unknown,
  path = 'value',
): string[] {
  return validateNode(prepared.raw, prepared.dsh, value, path)
}
