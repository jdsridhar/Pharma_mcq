import { Body, Controller, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@pharmacy/contracts';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import { SetCurriculumMappingsDto } from '../dto/set-curriculum-mappings.dto';
import { SetExamMappingsDto } from '../dto/set-exam-mappings.dto';
import { SetKnowledgeMappingsDto } from '../dto/set-knowledge-mappings.dto';
import { SetTagsDto } from '../dto/set-tags.dto';
import { SetTrackMappingsDto } from '../dto/set-track-mappings.dto';
import { QuestionMappingService } from '../question-mapping.service';

/**
 * Question mappings — the Golden Rule surface. Phase 5: knowledge + tags
 * (exam/curriculum/track mappings arrive with those domains). PUT replaces the full set.
 */
@ApiTags('Questions')
@ApiBearerAuth()
@Controller('questions/:questionId/mappings')
export class QuestionMappingController {
  constructor(private readonly service: QuestionMappingService) {}

  @Permissions(PERMISSIONS.QUESTION_UPDATE)
  @Put('knowledge')
  @ApiOperation({ summary: 'Replace the question→knowledge-node mappings' })
  setKnowledge(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SetKnowledgeMappingsDto,
  ): Promise<{ knowledgeNodeIds: string[] }> {
    return this.service.setKnowledge(questionId, dto);
  }

  @Permissions(PERMISSIONS.QUESTION_UPDATE)
  @Put('curriculum')
  @ApiOperation({ summary: 'Replace the question→curriculum-node mappings' })
  setCurriculum(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SetCurriculumMappingsDto,
  ): Promise<{ curriculumNodeIds: string[] }> {
    return this.service.setCurriculum(questionId, dto);
  }

  @Permissions(PERMISSIONS.QUESTION_UPDATE)
  @Put('exams')
  @ApiOperation({ summary: 'Replace the question→exam-profile mappings' })
  setExams(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SetExamMappingsDto,
  ): Promise<{ examProfileIds: string[] }> {
    return this.service.setExams(questionId, dto);
  }

  @Permissions(PERMISSIONS.QUESTION_UPDATE)
  @Put('tracks')
  @ApiOperation({ summary: 'Replace the question→track-module mappings' })
  setTracks(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SetTrackMappingsDto,
  ): Promise<{ trackModuleIds: string[] }> {
    return this.service.setTracks(questionId, dto);
  }

  @Permissions(PERMISSIONS.QUESTION_UPDATE)
  @Put('tags')
  @ApiOperation({ summary: 'Replace the question tags (created on demand)' })
  setTags(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SetTagsDto,
  ): Promise<{ tags: string[] }> {
    return this.service.setTags(questionId, dto);
  }
}
