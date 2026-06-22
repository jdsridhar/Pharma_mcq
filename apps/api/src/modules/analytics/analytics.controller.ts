import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type MasteryEntryDto,
  type MasteryOverviewDto,
  PERMISSIONS,
  type QuestionMetricsDto,
  type RecomputeMasteryResultDto,
  type TopicMetricsDto,
} from '@pharmacy/contracts';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Permissions } from '../identity/decorators/permissions.decorator';
import { AnalyticsService } from './analytics.service';
import { MasteryService } from './mastery.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly mastery: MasteryService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Post('me/recompute-mastery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recompute the current user’s mastery from their answers' })
  recompute(@CurrentUser('id') userId: string): Promise<RecomputeMasteryResultDto> {
    return this.mastery.recompute(userId);
  }

  @Get('me/mastery')
  @ApiOperation({ summary: 'The current user’s mastery by knowledge node' })
  myMastery(@CurrentUser('id') userId: string): Promise<MasteryEntryDto[]> {
    return this.mastery.getMyMastery(userId);
  }

  @Get('me/overview')
  @ApiOperation({ summary: 'The current user’s overall analytics overview' })
  overview(@CurrentUser('id') userId: string): Promise<MasteryOverviewDto> {
    return this.mastery.getOverview(userId);
  }

  @Permissions(PERMISSIONS.ANALYTICS_READ)
  @Get('topics/:nodeId')
  @ApiOperation({ summary: 'Aggregated metrics for a knowledge node' })
  topic(@Param('nodeId', ParseUUIDPipe) nodeId: string): Promise<TopicMetricsDto> {
    return this.analytics.getTopicMetrics(nodeId);
  }

  @Permissions(PERMISSIONS.ANALYTICS_READ)
  @Get('questions/:id')
  @ApiOperation({ summary: 'Metrics for a single question' })
  question(@Param('id', ParseUUIDPipe) id: string): Promise<QuestionMetricsDto> {
    return this.analytics.getQuestionMetrics(id);
  }
}
