import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Paginated,
  type PracticeAnswerResultDto,
  type PracticeAvailableDto,
  type PracticeSessionDetailDto,
  type PracticeSessionDto,
  type PracticeSummaryDto,
} from '@pharmacy/contracts';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { StartPracticeSessionDto } from './dto/start-practice-session.dto';
import { PracticeAvailableQueryDto } from './dto/practice-available.query.dto';
import { ListPracticeSessionsQueryDto } from './dto/list-practice-sessions.query.dto';
import { SubmitPracticeAnswerDto } from './dto/submit-practice-answer.dto';
import { PracticeService } from './practice.service';

/**
 * Practice is student-self: every route acts on the authenticated user (no special
 * permission); the service verifies session ownership.
 */
@ApiTags('Practice')
@ApiBearerAuth()
@Controller('practice/sessions')
export class PracticeController {
  constructor(private readonly service: PracticeService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a practice session from a filtered question pool' })
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartPracticeSessionDto,
  ): Promise<PracticeSessionDetailDto> {
    return this.service.start(user.id, user.organizationId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user’s practice sessions' })
  list(
    @CurrentUser('id') userId: string,
    @Query() query: ListPracticeSessionsQueryDto,
  ): Promise<Paginated<PracticeSessionDto>> {
    return this.service.list(userId, query);
  }

  @Get('available')
  @ApiOperation({ summary: 'Count published questions matching the filters (drives the count field)' })
  available(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PracticeAvailableQueryDto,
  ): Promise<PracticeAvailableDto> {
    return this.service.available(user.organizationId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a practice session with its served questions' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<PracticeSessionDetailDto> {
    return this.service.get(id, userId);
  }

  @Get(':id/summary')
  @ApiOperation({ summary: 'Get the session summary (accuracy, per-knowledge breakdown)' })
  summary(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<PracticeSummaryDto> {
    return this.service.summary(id, userId);
  }

  @Post(':id/answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit an answer and get immediate feedback' })
  answer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitPracticeAnswerDto,
  ): Promise<PracticeAnswerResultDto> {
    return this.service.submitAnswer(id, userId, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete the session and return its summary' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<PracticeSummaryDto> {
    return this.service.complete(id, userId);
  }

  @Post(':id/abandon')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abandon the session' })
  abandon(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<PracticeSessionDto> {
    return this.service.abandon(id, userId);
  }
}
