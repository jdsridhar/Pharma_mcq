import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type KnowledgeEdgeDto } from '@pharmacy/contracts';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import { CreateKnowledgeEdgeDto } from '../dto/create-knowledge-edge.dto';
import { KnowledgeService } from '../knowledge.service';

@ApiTags('Knowledge')
@ApiBearerAuth()
@Controller('knowledge/edges')
export class KnowledgeEdgeController {
  constructor(private readonly service: KnowledgeService) {}

  @Permissions(PERMISSIONS.KNOWLEDGE_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an edge between two nodes (cycle-checked for hierarchy)' })
  create(@Body() dto: CreateKnowledgeEdgeDto): Promise<KnowledgeEdgeDto> {
    return this.service.createEdge(dto);
  }

  @Permissions(PERMISSIONS.KNOWLEDGE_MANAGE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an edge' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.deleteEdge(id);
  }
}
