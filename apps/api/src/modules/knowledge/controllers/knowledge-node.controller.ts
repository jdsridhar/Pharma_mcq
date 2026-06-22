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
import { PERMISSIONS, type KnowledgeNodeDto, type Paginated } from '@pharmacy/contracts';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import { CreateKnowledgeNodeDto } from '../dto/create-knowledge-node.dto';
import { GraphTraversalQueryDto } from '../dto/graph-traversal.query.dto';
import { ListKnowledgeNodesQueryDto } from '../dto/list-knowledge-nodes.query.dto';
import { UpdateKnowledgeNodeDto } from '../dto/update-knowledge-node.dto';
import { KnowledgeService } from '../knowledge.service';

@ApiTags('Knowledge')
@ApiBearerAuth()
@Controller('knowledge/nodes')
export class KnowledgeNodeController {
  constructor(private readonly service: KnowledgeService) {}

  @Permissions(PERMISSIONS.KNOWLEDGE_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a knowledge node' })
  create(@Body() dto: CreateKnowledgeNodeDto): Promise<KnowledgeNodeDto> {
    return this.service.createNode(dto);
  }

  @Permissions(PERMISSIONS.KNOWLEDGE_READ)
  @Get()
  @ApiOperation({ summary: 'List knowledge nodes (filter by type/search, paginated)' })
  list(@Query() query: ListKnowledgeNodesQueryDto): Promise<Paginated<KnowledgeNodeDto>> {
    return this.service.listNodes(query);
  }

  @Permissions(PERMISSIONS.KNOWLEDGE_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a knowledge node by id' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<KnowledgeNodeDto> {
    return this.service.getNode(id);
  }

  @Permissions(PERMISSIONS.KNOWLEDGE_READ)
  @Get(':id/descendants')
  @ApiOperation({ summary: 'Descendant nodes (downward) via hierarchical edges' })
  descendants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GraphTraversalQueryDto,
  ): Promise<KnowledgeNodeDto[]> {
    return this.service.descendants(id, query);
  }

  @Permissions(PERMISSIONS.KNOWLEDGE_READ)
  @Get(':id/ancestors')
  @ApiOperation({ summary: 'Ancestor nodes (upward) via hierarchical edges' })
  ancestors(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GraphTraversalQueryDto,
  ): Promise<KnowledgeNodeDto[]> {
    return this.service.ancestors(id, query);
  }

  @Permissions(PERMISSIONS.KNOWLEDGE_READ)
  @Get(':id/neighbors')
  @ApiOperation({ summary: 'Direct neighbours (either direction, depth 1)' })
  neighbors(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GraphTraversalQueryDto,
  ): Promise<KnowledgeNodeDto[]> {
    return this.service.neighbors(id, query);
  }

  @Permissions(PERMISSIONS.KNOWLEDGE_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a knowledge node (code is immutable)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeNodeDto,
  ): Promise<KnowledgeNodeDto> {
    return this.service.updateNode(id, dto);
  }

  @Permissions(PERMISSIONS.KNOWLEDGE_MANAGE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a node and remove its edges' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.deleteNode(id);
  }
}
