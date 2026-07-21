/**
 * ConfigModule 에 주입되는 환경변수 검증 함수.
 * 필수 변수가 없으면 부팅 시점에 즉시 실패시킨다.
 */
const REQUIRED_KEYS = ['DATABASE_URL'] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_KEYS.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
  return config;
}
