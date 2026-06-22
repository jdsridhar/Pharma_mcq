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
  type LearningTrackDetailDto,
  type LearningTrackDto,
  PERMISSIONS,
  type Paginated,
  type TrackProgressDto,
} from '@pharmacy/contracts';
import { CurrentUser } from '../../identity/decorators/current-user.decorator';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../identity/types/auth.types';
import { CreateLearningTrackDto } from '../dto/create-learning-track.dto';
import { ListLearningTracksQueryDto } from '../dto/list-learning-tracks.query.dto';
import { UpdateLearningTrackDto } from '../dto/update-learning-track.dto';
import { LearningService } from '../learning.service';

@ApiTags('Learning')
@ApiBearerAuth()
@Controller('tracks')
export class LearningTrackController {
  constructor(private readonly service: LearningService) {}

  @Permissions(PERMISSIONS.TRACK_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a learning track' })
  create(
    @Body() dto: CreateLearningTrackDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LearningTrackDetailDto> {
    return this.service.create(dto, actor);
  }

  @Permissions(PERMISSIONS.TRACK_READ)
  @Get()
  @ApiOperation({ summary: 'List learning tracks (status/exam/search, paginated)' })
  list(
    @Query() query: ListLearningTracksQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<LearningTrackDto>> {
    return this.service.list(query, actor);
  }

  @Permissions(PERMISSIONS.TRACK_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a track with its modules' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LearningTrackDetailDto> {
    return this.service.get(id, actor);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Get the current user’s progress across a track’s modules' })
  progress(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TrackProgressDto[]> {
    return this.service.getProgress(id, actor.id, actor);
  }

  @Permissions(PERMISSIONS.TRACK_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a learning track' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLearningTrackDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<LearningTrackDetailDto> {
    return this.service.update(id, dto, actor);
  }

  @Permissions(PERMISSIONS.TRACK_MANAGE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a learning track' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.service.remove(id, actor);
  }
}
