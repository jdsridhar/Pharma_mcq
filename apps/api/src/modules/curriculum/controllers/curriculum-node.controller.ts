import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type CurriculumNodeDto, PERMISSIONS } from '@pharmacy/contracts';
import { CurrentUser } from '../../identity/decorators/current-user.decorator';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../identity/types/auth.types';
import { CurriculumNodeService } from '../curriculum-node.service';
import { CreateCurriculumNodeDto } from '../dto/create-curriculum-node.dto';
import { SetCurriculumNodeKnowledgeDto } from '../dto/set-curriculum-node-knowledge.dto';
import { UpdateCurriculumNodeDto } from '../dto/update-curriculum-node.dto';

@ApiTags('Curriculum')
@ApiBearerAuth()
@Controller('curriculums/:curriculumId/nodes')
export class CurriculumNodeController {
  constructor(private readonly nodes: CurriculumNodeService) {}

  @Permissions(PERMISSIONS.CURRICULUM_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a node in the curriculum tree' })
  create(
    @Param('curriculumId', ParseUUIDPipe) curriculumId: string,
    @Body() dto: CreateCurriculumNodeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CurriculumNodeDto> {
    return this.nodes.createNode(curriculumId, dto, actor);
  }

  @Permissions(PERMISSIONS.CURRICULUM_MANAGE)
  @Patch(':nodeId')
  @ApiOperation({ summary: 'Update a node (rename, reorder, or re-parent)' })
  update(
    @Param('curriculumId', ParseUUIDPipe) curriculumId: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @Body() dto: UpdateCurriculumNodeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CurriculumNodeDto> {
    return this.nodes.updateNode(curriculumId, nodeId, dto, actor);
  }

  @Permissions(PERMISSIONS.CURRICULUM_MANAGE)
  @Delete(':nodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a leaf node' })
  remove(
    @Param('curriculumId', ParseUUIDPipe) curriculumId: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.nodes.deleteNode(curriculumId, nodeId, actor);
  }

  @Permissions(PERMISSIONS.CURRICULUM_MANAGE)
  @Put(':nodeId/knowledge')
  @ApiOperation({ summary: 'Replace the node→knowledge-node mappings' })
  setKnowledge(
    @Param('curriculumId', ParseUUIDPipe) curriculumId: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @Body() dto: SetCurriculumNodeKnowledgeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ knowledgeNodeIds: string[] }> {
    return this.nodes.setNodeKnowledge(curriculumId, nodeId, dto, actor);
  }
}
