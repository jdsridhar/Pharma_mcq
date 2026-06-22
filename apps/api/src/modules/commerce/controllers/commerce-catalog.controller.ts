import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type FeatureDto,
  PERMISSIONS,
  type PlanDetailDto,
  type PlanDto,
  type PlanPriceDto,
} from '@pharmacy/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import { CatalogService } from '../catalog.service';
import { CreateFeatureDto } from '../dto/create-feature.dto';
import { CreatePlanPriceDto } from '../dto/create-plan-price.dto';
import { CreatePlanDto } from '../dto/create-plan.dto';
import { SetPlanFeaturesDto } from '../dto/set-plan-features.dto';
import { UpdatePlanPriceDto } from '../dto/update-plan-price.dto';
import { UpdatePlanDto } from '../dto/update-plan.dto';

@ApiTags('Commerce')
@Controller('commerce')
export class CommerceCatalogController {
  constructor(private readonly service: CatalogService) {}

  // ── Public catalog ──
  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'List active plans with prices + features (public)' })
  listPlans(): Promise<PlanDetailDto[]> {
    return this.service.listActivePlans();
  }

  @Public()
  @Get('plans/:id')
  @ApiOperation({ summary: 'Get a plan (public)' })
  getPlan(@Param('id', ParseUUIDPipe) id: string): Promise<PlanDetailDto> {
    return this.service.getPlan(id);
  }

  // ── Admin catalog management ──
  @Permissions(PERMISSIONS.PLAN_MANAGE)
  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a plan' })
  createPlan(@Body() dto: CreatePlanDto): Promise<PlanDto> {
    return this.service.createPlan(dto);
  }

  @Permissions(PERMISSIONS.PLAN_MANAGE)
  @Patch('plans/:id')
  @ApiOperation({ summary: 'Update a plan' })
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
  ): Promise<PlanDetailDto> {
    return this.service.updatePlan(id, dto);
  }

  @Permissions(PERMISSIONS.PLAN_MANAGE)
  @Post('plans/:id/prices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a price to a plan' })
  addPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePlanPriceDto,
  ): Promise<PlanPriceDto> {
    return this.service.addPrice(id, dto);
  }

  @Permissions(PERMISSIONS.PLAN_MANAGE)
  @Patch('prices/:id')
  @ApiOperation({ summary: 'Update a plan price' })
  updatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanPriceDto,
  ): Promise<PlanPriceDto> {
    return this.service.updatePrice(id, dto);
  }

  @Permissions(PERMISSIONS.PLAN_MANAGE)
  @Put('plans/:id/features')
  @ApiOperation({ summary: 'Replace a plan’s feature grants' })
  setPlanFeatures(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPlanFeaturesDto,
  ): Promise<PlanDetailDto> {
    return this.service.setPlanFeatures(id, dto);
  }

  @Permissions(PERMISSIONS.PLAN_MANAGE)
  @Post('features')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a feature' })
  createFeature(@Body() dto: CreateFeatureDto): Promise<FeatureDto> {
    return this.service.createFeature(dto);
  }

  @Permissions(PERMISSIONS.PLAN_MANAGE)
  @Get('features')
  @ApiOperation({ summary: 'List features' })
  listFeatures(): Promise<FeatureDto[]> {
    return this.service.listFeatures();
  }
}
