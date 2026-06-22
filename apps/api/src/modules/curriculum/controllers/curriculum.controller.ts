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
  type CurriculumDto,
  type CurriculumTreeNodeDto,
  PERMISSIONS,
  type Paginated,
} from '@pharmacy/contracts';
import { CurrentUser } from '../../identity/decorators/current-user.decorator';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../identity/types/auth.types';
import { CurriculumNodeService } from '../curriculum-node.service';
import { CurriculumService } from '../curriculum.service';
import { CreateCurriculumDto } from '../dto/create-curriculum.dto';
import { ListCurriculumsQueryDto } from '../dto/list-curriculums.query.dto';
import { UpdateCurriculumDto } from '../dto/update-curriculum.dto';

@ApiTags('Curriculum')
@ApiBearerAuth()
@Controller('curriculums')
export class CurriculumController {
  constructor(
    private readonly service: CurriculumService,
    private readonly nodes: CurriculumNodeService,
  ) {}

  @Permissions(PERMISSIONS.CURRICULUM_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a curriculum' })
  create(
    @Body() dto: CreateCurriculumDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CurriculumDto> {
    return this.service.create(dto, actor);
  }

  @Permissions(PERMISSIONS.CURRICULUM_READ)
  @Get()
  @ApiOperation({ summary: 'List curriculums (filter by status/search, paginated)' })
  list(
    @Query() query: ListCurriculumsQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<CurriculumDto>> {
    return this.service.list(query, actor);
  }

  @Permissions(PERMISSIONS.CURRICULUM_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a curriculum' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CurriculumDto> {
    return this.service.get(id, actor);
  }

  @Permissions(PERMISSIONS.CURRICULUM_READ)
  @Get(':id/tree')
  @ApiOperation({ summary: 'Get the curriculum node tree (nested)' })
  tree(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CurriculumTreeNodeDto[]> {
    return this.nodes.getTree(id, actor);
  }

  @Permissions(PERMISSIONS.CURRICULUM_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a curriculum' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCurriculumDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CurriculumDto> {
    return this.service.update(id, dto, actor);
  }

  @Permissions(PERMISSIONS.CURRICULUM_MANAGE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a curriculum' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.service.remove(id, actor);
  }
}
