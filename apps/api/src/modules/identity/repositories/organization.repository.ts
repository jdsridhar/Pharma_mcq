import { Injectable } from '@nestjs/common';
import type { Organization } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

/** Lookups for the tenant boundary. Single default org until multi-tenancy activates. */
@Injectable()
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySlug(slug: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { slug } });
  }

  findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }
}
