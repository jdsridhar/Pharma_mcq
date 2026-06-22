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
  type TestResultDto,
  type TestSessionDetailDto,
  type TestSessionDto,
} from '@pharmacy/contracts';
import { CurrentUser } from '../../identity/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/types/auth.types';
import { ListTestSessionsQueryDto } from '../dto/list-test-sessions.query.dto';
import { StartAdHocTestDto } from '../dto/start-ad-hoc-test.dto';
import { SubmitTestAnswerDto } from '../dto/submit-test-answer.dto';
import { TestSessionService } from '../test-session.service';

/** Test attempts — student-self (authenticated; the service verifies ownership). */
@ApiTags('Assessment')
@ApiBearerAuth()
@Controller('assessments/sessions')
export class TestSessionController {
  constructor(private readonly service: TestSessionService) {}

  @Post('ad-hoc')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start an ad-hoc timed test (no cohort ranking)' })
  startAdHoc(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartAdHocTestDto,
  ): Promise<TestSessionDetailDto> {
    return this.service.startAdHoc(user.id, user.organizationId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user’s test sessions' })
  list(
    @CurrentUser('id') userId: string,
    @Query() query: ListTestSessionsQueryDto,
  ): Promise<Paginated<TestSessionDto>> {
    return this.service.list(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a test session with its (snapshot) questions' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<TestSessionDetailDto> {
    return this.service.get(id, userId);
  }

  @Get(':id/result')
  @ApiOperation({ summary: 'Get the result (score, rank, percentile) of a submitted session' })
  result(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<TestResultDto> {
    return this.service.getResult(id, userId);
  }

  @Post(':id/answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save an answer (not scored until submit)' })
  answer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitTestAnswerDto,
  ): Promise<{ snapshotId: string; saved: true }> {
    return this.service.submitAnswer(id, userId, dto);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit the session — scores it and returns the result' })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<TestResultDto> {
    return this.service.submit(id, userId);
  }
}
