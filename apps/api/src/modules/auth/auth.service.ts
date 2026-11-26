import type { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { hasRole, ROLE_RANK, type Role, type UserDTO } from '@jobs/shared';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../lib/errors';
import type { AuditService } from '../audit/audit.service';

export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  };
}

const BCRYPT_ROUNDS = 11;
// Hash compared against when the email does not exist, to equalise response timing.
let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('timing-equaliser-not-a-password', BCRYPT_ROUNDS));

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  hashPassword(password: string) {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async register(input: { name: string; email: string; password: string }): Promise<UserDTO> {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
    const user = await this.prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash: await this.hashPassword(input.password), role: 'VIEWER' },
    });
    await this.audit.log(user.id, 'AUTH_REGISTER', 'User', user.id);
    return toUserDTO(user);
  }

  async login(email: string, password: string): Promise<UserDTO> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
    if (!user || !ok) throw unauthorized('Invalid email or password');
    if (user.status !== 'ACTIVE') throw forbidden('This account is suspended');
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log(user.id, 'AUTH_LOGIN', 'User', user.id);
    return toUserDTO(updated);
  }

  async getActiveUser(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user && user.status === 'ACTIVE' ? user : null;
  }
}

export class UsersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async list(params: { q?: string; page: number; pageSize: number }) {
    const where = params.q
      ? { OR: [{ name: { contains: params.q, mode: 'insensitive' as const } }, { email: { contains: params.q, mode: 'insensitive' as const } }] }
      : {};
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (params.page - 1) * params.pageSize, take: params.pageSize }),
    ]);
    return { data: users.map(toUserDTO), meta: { page: params.page, pageSize: params.pageSize, total, totalPages: Math.max(1, Math.ceil(total / params.pageSize)) } };
  }

  /** Admins may only manage roles strictly below their own; super admins manage everyone. */
  private assertCanAssign(actorRole: Role, targetRole: Role) {
    if (actorRole === 'SUPER_ADMIN') return;
    if (ROLE_RANK[targetRole] >= ROLE_RANK[actorRole]) throw forbidden('You cannot assign a role equal to or above your own');
  }

  async create(input: { name: string; email: string; password: string; role: Role }, actor: { id: string; role: Role }): Promise<UserDTO> {
    this.assertCanAssign(actor.role, input.role);
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
    const user = await this.prisma.user.create({
      data: { name: input.name, email: input.email, role: input.role, passwordHash: await this.auth.hashPassword(input.password) },
    });
    await this.audit.log(actor.id, 'USER_CREATE', 'User', user.id, { role: input.role });
    return toUserDTO(user);
  }

  async update(id: string, input: { name?: string; role?: Role; status?: 'ACTIVE' | 'SUSPENDED' }, actor: { id: string; role: Role }): Promise<UserDTO> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('User');
    if (id === actor.id && (input.role || input.status)) throw badRequest('You cannot change your own role or status');
    if (!hasRole(actor.role, 'SUPER_ADMIN') && ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) {
      throw forbidden('You cannot modify a user with an equal or higher role');
    }
    if (input.role) this.assertCanAssign(actor.role, input.role);
    if (target.role === 'SUPER_ADMIN' && (input.role && input.role !== 'SUPER_ADMIN' || input.status === 'SUSPENDED')) {
      const supers = await this.prisma.user.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } });
      if (supers <= 1) throw badRequest('At least one active Super Admin is required');
    }
    const user = await this.prisma.user.update({ where: { id }, data: input });
    await this.audit.log(actor.id, 'USER_UPDATE', 'User', id, { changes: input });
    return toUserDTO(user);
  }
}
