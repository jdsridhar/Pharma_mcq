import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Paginated,
  type RecommendationRuleDto,
  SystemRole,
} from '@pharmacy/contracts';
import { Roles } from '../identity/decorators/roles.decorator';
import { CreateRecommendationRuleDto } from './dto/create-recommendation-rule.dto';
import { ListRecommendationRulesQueryDto } from './dto/list-recommendation-rules.query.dto';
import { UpdateRecommendationRuleDto } from './dto/update-recommendation-rule.dto';
import { RecommendationRuleService } from './recommendation-rule.service';

/** Recommendation rule administration (Admin / Super Admin only). */
@ApiTags('Recommendation')
@ApiBearerAuth()
@Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
@Controller('recommendation-rules')
export class RecommendationRuleController {
  constructor(private readonly service: RecommendationRuleService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a recommendation rule' })
  create(@Body() dto: CreateRecommendationRuleDto): Promise<RecommendationRuleDto> {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List recommendation rules' })
  list(@Query() query: ListRecommendationRulesQueryDto): Promise<Paginated<RecommendationRuleDto>> {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a recommendation rule' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RecommendationRuleDto> {
    return this.service.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a recommendation rule' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecommendationRuleDto,
  ): Promise<RecommendationRuleDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a recommendation rule' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
