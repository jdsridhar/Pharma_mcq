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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type ExamBlueprintDto,
  type ExamKnowledgeMappingDto,
  type ExamProfileDto,
  PERMISSIONS,
  type Paginated,
} from '@pharmacy/contracts';
import { CurrentUser } from '../../identity/decorators/current-user.decorator';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../identity/types/auth.types';
import { ExamBlueprintService } from '../exam-blueprint.service';
import { ExamService } from '../exam.service';
import { CreateExamProfileDto } from '../dto/create-exam-profile.dto';
import { ListExamProfilesQueryDto } from '../dto/list-exam-profiles.query.dto';
import { SetExamKnowledgeDto } from '../dto/set-exam-knowledge.dto';
import { UpdateExamProfileDto } from '../dto/update-exam-profile.dto';

@ApiTags('Exams')
@ApiBearerAuth()
@Controller('exams')
export class ExamProfileController {
  constructor(
    private readonly service: ExamService,
    private readonly blueprints: ExamBlueprintService,
  ) {}

  @Permissions(PERMISSIONS.EXAM_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an exam profile' })
  create(
    @Body() dto: CreateExamProfileDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamProfileDto> {
    return this.service.create(dto, actor);
  }

  @Permissions(PERMISSIONS.EXAM_READ)
  @Get()
  @ApiOperation({ summary: 'List exam profiles (status/search, paginated)' })
  list(
    @Query() query: ListExamProfilesQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<ExamProfileDto>> {
    return this.service.list(query, actor);
  }

  @Permissions(PERMISSIONS.EXAM_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get an exam profile' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamProfileDto> {
    return this.service.get(id, actor);
  }

  @Permissions(PERMISSIONS.EXAM_READ)
  @Get(':id/blueprints')
  @ApiOperation({ summary: 'List an exam profile’s blueprints (with items)' })
  listBlueprints(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamBlueprintDto[]> {
    return this.blueprints.list(id, actor);
  }

  @Permissions(PERMISSIONS.EXAM_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update an exam profile' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExamProfileDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamProfileDto> {
    return this.service.update(id, dto, actor);
  }

  @Permissions(PERMISSIONS.EXAM_MANAGE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an exam profile' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.service.remove(id, actor);
  }

  @Permissions(PERMISSIONS.EXAM_MANAGE)
  @Put(':id/knowledge')
  @ApiOperation({ summary: 'Replace the exam→knowledge-node mappings' })
  setKnowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetExamKnowledgeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ items: ExamKnowledgeMappingDto[] }> {
    return this.service.setKnowledge(id, dto, actor);
  }
}
