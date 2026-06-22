import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateFeatureInput,
  type CreatePlanInput,
  type CreatePlanPriceInput,
  type FeatureDto,
  type PlanDetailDto,
  type PlanDto,
  type PlanPriceDto,
  type SetPlanFeaturesInput,
  type UpdatePlanInput,
  type UpdatePlanPriceInput,
} from '@pharmacy/contracts';
import { type Feature, type Plan, type PlanPrice, Prisma } from '@prisma/client';
import { type ActivePlan, CommerceRepository, type PlanDetail } from './repositories/commerce.repository';

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class CatalogService {
  constructor(private readonly repo: CommerceRepository) {}

  async createPlan(input: CreatePlanInput): Promise<PlanDto> {
    try {
      return this.toPlanDto(await this.repo.createPlan(input));
    } catch (error) {
      if (isUnique(error)) {
        throw new ConflictException(`A plan with code "${input.code}" already exists`);
      }
      throw error;
    }
  }

  async listActivePlans(): Promise<PlanDetailDto[]> {
    const plans = await this.repo.listActivePlans();
    return plans.map((p) => this.toPlanDetailDto(p));
  }

  async getPlan(id: string): Promise<PlanDetailDto> {
    const plan = await this.repo.findPlanDetail(id);
    if (!plan) {
      throw new NotFoundException(`Plan ${id} not found`);
    }
    return this.toPlanDetailDto(plan);
  }

  async updatePlan(id: string, input: UpdatePlanInput): Promise<PlanDetailDto> {
    await this.requirePlan(id);
    await this.repo.updatePlan(id, {
      name: input.name,
      description: input.description,
      isActive: input.isActive,
      seatLimit: input.seatLimit,
    });
    return this.getPlan(id);
  }

  async addPrice(planId: string, input: CreatePlanPriceInput): Promise<PlanPriceDto> {
    await this.requirePlan(planId);
    try {
      const price = await this.repo.createPrice({
        planId,
        billingInterval: input.billingInterval,
        amountMinor: input.amountMinor,
        currency: input.currency,
        isActive: input.isActive,
      });
      return this.toPriceDto(price);
    } catch (error) {
      if (isUnique(error)) {
        throw new ConflictException('A price for this interval + currency already exists');
      }
      throw error;
    }
  }

  async updatePrice(id: string, input: UpdatePlanPriceInput): Promise<PlanPriceDto> {
    const price = await this.repo.findPriceById(id);
    if (!price) {
      throw new NotFoundException(`Price ${id} not found`);
    }
    const updated = await this.repo.updatePrice(id, {
      amountMinor: input.amountMinor,
      isActive: input.isActive,
    });
    return this.toPriceDto(updated);
  }

  async createFeature(input: CreateFeatureInput): Promise<FeatureDto> {
    try {
      return this.toFeatureDto(await this.repo.createFeature(input));
    } catch (error) {
      if (isUnique(error)) {
        throw new ConflictException(`A feature with key "${input.key}" already exists`);
      }
      throw error;
    }
  }

  async listFeatures(): Promise<FeatureDto[]> {
    return (await this.repo.listFeatures()).map((f) => this.toFeatureDto(f));
  }

  async setPlanFeatures(planId: string, input: SetPlanFeaturesInput): Promise<PlanDetailDto> {
    await this.requirePlan(planId);
    const keys = input.items.map((i) => i.featureKey);
    const features = await this.repo.findFeaturesByKeys(keys);
    const byKey = new Map(features.map((f) => [f.key, f.id]));
    const missing = keys.filter((k) => !byKey.has(k));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown feature key(s): ${missing.join(', ')}`);
    }
    await this.repo.setPlanFeatures(
      planId,
      input.items.map((i) => ({ featureId: byKey.get(i.featureKey) as string, limit: i.limit ?? null })),
    );
    return this.getPlan(planId);
  }

  private async requirePlan(id: string): Promise<Plan> {
    const plan = await this.repo.findPlanById(id);
    if (!plan) {
      throw new NotFoundException(`Plan ${id} not found`);
    }
    return plan;
  }

  private toPlanDto(plan: Plan): PlanDto {
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description ?? null,
      isActive: plan.isActive,
      seatLimit: plan.seatLimit ?? null,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }

  private toPlanDetailDto(plan: PlanDetail | ActivePlan): PlanDetailDto {
    return {
      ...this.toPlanDto(plan),
      prices: plan.prices.map((p) => this.toPriceDto(p)),
      features: plan.features.map((pf) => ({
        key: pf.feature.key,
        name: pf.feature.name,
        limit: pf.limit ?? null,
      })),
    };
  }

  private toPriceDto(price: PlanPrice): PlanPriceDto {
    return {
      id: price.id,
      planId: price.planId,
      billingInterval: price.billingInterval,
      amountMinor: price.amountMinor,
      currency: price.currency,
      isActive: price.isActive,
    };
  }

  private toFeatureDto(feature: Feature): FeatureDto {
    return {
      id: feature.id,
      key: feature.key,
      name: feature.name,
      description: feature.description ?? null,
    };
  }
}
