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
import { PERMISSIONS, type TrackModuleDto, type TrackProgressDto } from '@pharmacy/contracts';
import { CurrentUser } from '../../identity/decorators/current-user.decorator';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../identity/types/auth.types';
import { CreateTrackModuleDto } from '../dto/create-track-module.dto';
import { SetTrackModuleKnowledgeDto } from '../dto/set-track-module-knowledge.dto';
import { SetTrackProgressDto } from '../dto/set-track-progress.dto';
import { UpdateTrackModuleDto } from '../dto/update-track-module.dto';
import { TrackModuleService } from '../track-module.service';

@ApiTags('Learning')
@ApiBearerAuth()
@Controller('tracks/:trackId/modules')
export class TrackModuleController {
  constructor(private readonly service: TrackModuleService) {}

  @Permissions(PERMISSIONS.TRACK_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a module in a track' })
  create(
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @Body() dto: CreateTrackModuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TrackModuleDto> {
    return this.service.create(trackId, dto, actor);
  }

  @Permissions(PERMISSIONS.TRACK_MANAGE)
  @Patch(':moduleId')
  @ApiOperation({ summary: 'Update a module' })
  update(
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: UpdateTrackModuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TrackModuleDto> {
    return this.service.update(trackId, moduleId, dto, actor);
  }

  @Permissions(PERMISSIONS.TRACK_MANAGE)
  @Delete(':moduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a module' })
  remove(
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.service.remove(trackId, moduleId, actor);
  }

  @Permissions(PERMISSIONS.TRACK_MANAGE)
  @Put(':moduleId/knowledge')
  @ApiOperation({ summary: 'Replace the module→knowledge-node mappings' })
  setKnowledge(
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: SetTrackModuleKnowledgeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ knowledgeNodeIds: string[] }> {
    return this.service.setKnowledge(trackId, moduleId, dto, actor);
  }

  @Put(':moduleId/progress')
  @ApiOperation({ summary: 'Set the current user’s progress for a module' })
  setProgress(
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SetTrackProgressDto,
  ): Promise<TrackProgressDto> {
    return this.service.setProgress(trackId, moduleId, actor.id, dto, actor);
  }
}
