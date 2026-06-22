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
  type BulkActionResultDto,
  type DuplicateCandidateDto,
  PERMISSIONS,
  type Paginated,
  type QuestionDetailDto,
  type QuestionSummaryDto,
  type QuestionVersionDto,
} from '@pharmacy/contracts';
import { CurrentUser } from '../../identity/decorators/current-user.decorator';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../identity/types/auth.types';
import { BulkQuestionActionDto } from '../dto/bulk-question-action.dto';
import { CheckDuplicateQueryDto } from '../dto/check-duplicate.query.dto';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { CreateVersionDto } from '../dto/create-version.dto';
import { ListQuestionsQueryDto } from '../dto/list-questions.query.dto';
import { UpdateQuestionMetaDto } from '../dto/update-question-meta.dto';
import { QuestionService } from '../question.service';

@ApiTags('Questions')
@ApiBearerAuth()
@Controller('questions')
export class QuestionController {
  constructor(private readonly service: QuestionService) {}

  @Permissions(PERMISSIONS.QUESTION_CREATE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a question (with its first draft version)' })
  create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuestionDetailDto> {
    return this.service.create(dto, user);
  }

  @Permissions(PERMISSIONS.QUESTION_READ)
  @Get()
  @ApiOperation({ summary: 'List questions (filter by status/type/knowledge/text, paginated, org-scoped)' })
  list(
    @Query() query: ListQuestionsQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<QuestionSummaryDto>> {
    return this.service.list(query, actor);
  }

  // Bulk workflow actions (accept/reject/publish/…). Per-action permission is enforced in the
  // service so one endpoint can serve every action. Declared before ':id' so the literal matches.
  @Post('bulk')
  @ApiOperation({ summary: 'Run a workflow action (submit/approve/reject/publish/archive/delete) on many questions' })
  bulk(
    @Body() dto: BulkQuestionActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BulkActionResultDto> {
    return this.service.bulkAction(dto, user);
  }

  // Declared before ':id' so the literal path is matched first.
  @Permissions(PERMISSIONS.QUESTION_READ)
  @Get('check-duplicate')
  @ApiOperation({ summary: 'Find near-duplicate questions by trigram similarity' })
  checkDuplicate(@Query() query: CheckDuplicateQueryDto): Promise<DuplicateCandidateDto[]> {
    return this.service.checkDuplicates(query);
  }

  @Permissions(PERMISSIONS.QUESTION_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a question with its current + working versions and mappings' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<QuestionDetailDto> {
    return this.service.get(id);
  }

  @Permissions(PERMISSIONS.QUESTION_READ)
  @Get(':id/versions')
  @ApiOperation({ summary: 'List all versions of a question' })
  versions(@Param('id', ParseUUIDPipe) id: string): Promise<QuestionVersionDto[]> {
    return this.service.listVersions(id);
  }

  @Permissions(PERMISSIONS.QUESTION_UPDATE)
  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new content version (resets status to DRAFT)' })
  addVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuestionDetailDto> {
    return this.service.addVersion(id, dto, user);
  }

  @Permissions(PERMISSIONS.QUESTION_UPDATE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update question metadata (difficulty, language)' })
  updateMeta(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionMetaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuestionDetailDto> {
    return this.service.updateMeta(id, dto, user);
  }

  @Permissions(PERMISSIONS.QUESTION_UPDATE)
  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit a draft for review (DRAFT → REVIEW)' })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuestionDetailDto> {
    return this.service.submit(id, user);
  }

  @Permissions(PERMISSIONS.QUESTION_APPROVE)
  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a question under review (REVIEW → APPROVED)' })
  approve(@Param('id', ParseUUIDPipe) id: string): Promise<QuestionDetailDto> {
    return this.service.approve(id);
  }

  @Permissions(PERMISSIONS.QUESTION_REVIEW)
  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a question under review (REVIEW → DRAFT)' })
  reject(@Param('id', ParseUUIDPipe) id: string): Promise<QuestionDetailDto> {
    return this.service.reject(id);
  }

  @Permissions(PERMISSIONS.QUESTION_PUBLISH)
  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish an approved question (APPROVED → PUBLISHED)' })
  publish(@Param('id', ParseUUIDPipe) id: string): Promise<QuestionDetailDto> {
    return this.service.publish(id);
  }

  @Permissions(PERMISSIONS.QUESTION_PUBLISH)
  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a question (PUBLISHED/APPROVED → ARCHIVED)' })
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<QuestionDetailDto> {
    return this.service.archive(id);
  }

  @Permissions(PERMISSIONS.QUESTION_DELETE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a question' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
