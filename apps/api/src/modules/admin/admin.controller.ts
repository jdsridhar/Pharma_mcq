import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminRoleDto,
  type AdminUserDto,
  type AuditLogDto,
  type OrganizationDto,
  type OrgSubscriptionDto,
  PERMISSIONS,
  type Paginated,
  type ReviewQuestionDto,
  SystemRole,
} from '@pharmacy/contracts';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Permissions } from '../identity/decorators/permissions.decorator';
import { Roles } from '../identity/decorators/roles.decorator';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { AdminService } from './admin.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { AssignOrgSubscriptionDto } from './dto/assign-org-subscription.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.query.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  // ── Organizations (multi-tenancy; super-admin only) ──
  @Roles(SystemRole.SUPER_ADMIN)
  @Post('organizations')
  @ApiOperation({ summary: 'Create an institution (organization)' })
  createOrganization(@Body() dto: CreateOrganizationDto): Promise<OrganizationDto> {
    return this.admin.createOrganization(dto);
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Get('organizations')
  @ApiOperation({ summary: 'List organizations with user counts' })
  organizations(): Promise<OrganizationDto[]> {
    return this.admin.listOrganizations();
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Post('organizations/:id/subscription')
  @ApiOperation({ summary: 'Provision an institutional (seat-based) plan to an organization' })
  provisionOrgSubscription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignOrgSubscriptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OrgSubscriptionDto> {
    return this.admin.provisionOrgSubscription(id, dto, actor);
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Get('organizations/:id/subscription')
  @ApiOperation({ summary: "Get an organization's seat subscription + live usage (null if none)" })
  orgSubscription(@Param('id', ParseUUIDPipe) id: string): Promise<OrgSubscriptionDto | null> {
    return this.admin.getOrgSubscription(id);
  }

  // ── Audit ──
  @Permissions(PERMISSIONS.AUDIT_READ)
  @Get('audit-logs')
  @ApiOperation({ summary: 'List audit log entries (filter by entityType/actor)' })
  auditLogs(@Query() query: ListAuditLogsQueryDto): Promise<Paginated<AuditLogDto>> {
    return this.audit.list(query);
  }

  @Permissions(PERMISSIONS.AUDIT_READ)
  @Get('audit-logs/:entityType/:entityId')
  @ApiOperation({ summary: 'Audit history for a specific entity' })
  auditHistory(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ): Promise<AuditLogDto[]> {
    return this.audit.listByEntity(entityType, entityId);
  }

  // ── Users & roles (org-scoped: super-admin sees all, others only their org) ──
  @Permissions(PERMISSIONS.USER_READ)
  @Get('users')
  @ApiOperation({ summary: 'List users (search, paginated, org-scoped)' })
  users(@Query() query: ListUsersQueryDto, @CurrentUser() actor: AuthenticatedUser): Promise<Paginated<AdminUserDto>> {
    return this.admin.listUsers(query, actor);
  }

  @Permissions(PERMISSIONS.USER_MANAGE)
  @Post('users')
  @ApiOperation({ summary: 'Create a user (active, email pre-verified) with an optional role' })
  createUser(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser): Promise<AdminUserDto> {
    return this.admin.createUser(dto, actor);
  }

  @Permissions(PERMISSIONS.USER_READ)
  @Get('users/:id')
  @ApiOperation({ summary: 'Get a user with roles' })
  user(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser): Promise<AdminUserDto> {
    return this.admin.getUser(id, actor);
  }

  @Permissions(PERMISSIONS.USER_MANAGE)
  @Post('users/:id/roles')
  @ApiOperation({ summary: 'Assign a role to a user' })
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AdminUserDto> {
    return this.admin.assignRole(id, dto.roleId, actor);
  }

  @Permissions(PERMISSIONS.USER_MANAGE)
  @Delete('users/:id/roles/:roleId')
  @ApiOperation({ summary: 'Remove a role from a user' })
  removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AdminUserDto> {
    return this.admin.removeRole(id, roleId, actor);
  }

  @Permissions(PERMISSIONS.USER_MANAGE)
  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Set a user’s status (activate/suspend/deactivate)' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AdminUserDto> {
    return this.admin.setStatus(id, dto, actor);
  }

  @Permissions(PERMISSIONS.USER_MANAGE)
  @Get('roles')
  @ApiOperation({ summary: 'List roles (for assignment)' })
  roles(): Promise<AdminRoleDto[]> {
    return this.admin.listRoles();
  }

  // ── Review queue ──
  @Permissions(PERMISSIONS.QUESTION_REVIEW)
  @Get('review-queue')
  @ApiOperation({ summary: 'Questions awaiting review' })
  reviewQueue(@Query() query: ListUsersQueryDto): Promise<Paginated<ReviewQuestionDto>> {
    return this.admin.reviewQueue(query);
  }
}
