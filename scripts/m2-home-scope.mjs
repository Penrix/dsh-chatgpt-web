export function snapshotHomeEnvironment(env = process.env) {
  return {
    HOME: env.HOME,
    USERPROFILE: env.USERPROFILE,
  }
}

export function restoreHomeEnvironment(snapshot, env = process.env) {
  if (snapshot.HOME === undefined) delete env.HOME
  else env.HOME = snapshot.HOME

  if (snapshot.USERPROFILE === undefined) delete env.USERPROFILE
  else env.USERPROFILE = snapshot.USERPROFILE
}

export async function withTemporaryHome(home, operation, env = process.env) {
  const snapshot = snapshotHomeEnvironment(env)
  env.HOME = home
  env.USERPROFILE = home
  try {
    return await operation()
  } finally {
    restoreHomeEnvironment(snapshot, env)
  }
}
