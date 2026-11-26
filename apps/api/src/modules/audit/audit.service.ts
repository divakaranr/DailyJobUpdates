import type { Prisma, PrismaClient } from '@prisma/client';

export type AuditAction =
  | 'JOB_CREATE'
  | 'JOB_UPDATE'
  | 'JOB_PUBLISH'
  | 'JOB_SUBMIT'
  | 'JOB_SCHEDULE'
  | 'JOB_APPROVE'
  | 'JOB_REJECT'
  | 'JOB_EXPIRE'
  | 'JOB_ARCHIVE'
  | 'JOB_RESTORE'
  | 'JOB_DELETE'
  | 'JOB_VERIFY'
  | 'JOB_AUTO_EXPIRE'
  | 'JOB_AUTO_PUBLISH'
  | 'EXTRACTION_SUBMIT'
  | 'EXTRACTION_DISCARD'
  | 'TAG_CREATE'
  | 'TAG_UPDATE'
  | 'TAG_DELETE'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'SETTINGS_UPDATE'
  | 'AUTH_LOGIN'
  | 'AUTH_REGISTER';

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async log(
    userId: string | null | undefined,
    action: AuditAction,
    entityType: string,
    entityId?: string | null,
    details?: Record<string, unknown>,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        userId: userId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
