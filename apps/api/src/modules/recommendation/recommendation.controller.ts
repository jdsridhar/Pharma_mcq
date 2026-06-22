import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type RecommendationDto,
  type StudyPlanDto as StudyPlanResultDto,
  type WeakAreaDto,
} from '@pharmacy/contracts';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { StudyPlanDto } from './dto/study-plan.dto';
import { RecommendationService } from './recommendation.service';

/** Student-facing recommendations. All routes act on the authenticated user. */
@ApiTags('Recommendation')
@ApiBearerAuth()
@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly service: RecommendationService) {}

  @Post('me/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate fresh recommendations (and record them)' })
  generate(@CurrentUser('id') userId: string): Promise<RecommendationDto[]> {
    return this.service.generate(userId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Most recently generated recommendations' })
  recent(@CurrentUser('id') userId: string): Promise<RecommendationDto[]> {
    return this.service.getRecent(userId);
  }

  @Get('me/weak-areas')
  @ApiOperation({ summary: 'Weak knowledge areas (low mastery + accuracy)' })
  weakAreas(@CurrentUser('id') userId: string): Promise<WeakAreaDto[]> {
    return this.service.getWeakAreas(userId);
  }

  @Post('me/study-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Build a day-by-day study plan from weak areas' })
  studyPlan(
    @CurrentUser('id') userId: string,
    @Body() dto: StudyPlanDto,
  ): Promise<StudyPlanResultDto> {
    return this.service.buildPlan(userId, dto);
  }
}
