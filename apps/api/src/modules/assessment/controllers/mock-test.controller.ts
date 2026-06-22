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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type MockTestDetailDto,
  type MockTestDto,
  PERMISSIONS,
  type Paginated,
  type TestSessionDetailDto,
} from '@pharmacy/contracts';
import { CurrentUser } from '../../identity/decorators/current-user.decorator';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../identity/types/auth.types';
import { CreateMockTestDto } from '../dto/create-mock-test.dto';
import { ListMockTestsQueryDto } from '../dto/list-mock-tests.query.dto';
import { SetMockTestQuestionsDto } from '../dto/set-mock-test-questions.dto';
import { UpdateMockTestDto } from '../dto/update-mock-test.dto';
import { MockTestService } from '../mock-test.service';
import { TestSessionService } from '../test-session.service';

@ApiTags('Assessment')
@ApiBearerAuth()
@Controller('mock-tests')
export class MockTestController {
  constructor(
    private readonly service: MockTestService,
    private readonly sessions: TestSessionService,
  ) {}

  @Permissions(PERMISSIONS.MOCKTEST_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a mock test' })
  create(
    @Body() dto: CreateMockTestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MockTestDto> {
    return this.service.create(dto, actor);
  }

  @Permissions(PERMISSIONS.MOCKTEST_READ)
  @Get()
  @ApiOperation({ summary: 'List mock tests (status/mode/exam/search, paginated)' })
  list(
    @Query() query: ListMockTestsQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<MockTestDto>> {
    return this.service.list(query, actor);
  }

  @Permissions(PERMISSIONS.MOCKTEST_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a mock test with its questions' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MockTestDetailDto> {
    return this.service.get(id, actor);
  }

  @Permissions(PERMISSIONS.MOCKTEST_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a mock test (incl. publish via status)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMockTestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MockTestDetailDto> {
    return this.service.update(id, dto, actor);
  }

  @Permissions(PERMISSIONS.MOCKTEST_MANAGE)
  @Put(':id/questions')
  @ApiOperation({ summary: 'Set the questions of a FIXED mock test (validated PUBLISHED)' })
  setQuestions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetMockTestQuestionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MockTestDetailDto> {
    return this.service.setQuestions(id, dto, actor);
  }

  // Starting an attempt is student-self (any authenticated user).
  @Post(':id/start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start an attempt of a published mock test (freezes snapshots)' })
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TestSessionDetailDto> {
    return this.sessions.startForMockTest(id, user.id, user.organizationId);
  }
}
