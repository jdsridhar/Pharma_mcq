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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type BlueprintPlanDto,
  type ExamBlueprintDto,
  type ExamBlueprintItemDto,
  PERMISSIONS,
} from '@pharmacy/contracts';
import { CurrentUser } from '../../identity/decorators/current-user.decorator';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../identity/types/auth.types';
import { ExamBlueprintService } from '../exam-blueprint.service';
import { CreateExamBlueprintItemDto } from '../dto/create-exam-blueprint-item.dto';
import { CreateExamBlueprintDto } from '../dto/create-exam-blueprint.dto';
import { UpdateExamBlueprintItemDto } from '../dto/update-exam-blueprint-item.dto';
import { UpdateExamBlueprintDto } from '../dto/update-exam-blueprint.dto';

@ApiTags('Exams')
@ApiBearerAuth()
@Controller('exams/:examId/blueprints')
export class ExamBlueprintController {
  constructor(private readonly service: ExamBlueprintService) {}

  @Permissions(PERMISSIONS.EXAM_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a blueprint' })
  create(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: CreateExamBlueprintDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamBlueprintDto> {
    return this.service.create(examId, dto, actor);
  }

  @Permissions(PERMISSIONS.EXAM_READ)
  @Get(':blueprintId')
  @ApiOperation({ summary: 'Get a blueprint with its items' })
  get(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('blueprintId', ParseUUIDPipe) blueprintId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamBlueprintDto> {
    return this.service.get(examId, blueprintId, actor);
  }

  @Permissions(PERMISSIONS.EXAM_MANAGE)
  @Patch(':blueprintId')
  @ApiOperation({ summary: 'Update a blueprint' })
  update(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('blueprintId', ParseUUIDPipe) blueprintId: string,
    @Body() dto: UpdateExamBlueprintDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamBlueprintDto> {
    return this.service.update(examId, blueprintId, dto, actor);
  }

  @Permissions(PERMISSIONS.EXAM_MANAGE)
  @Delete(':blueprintId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a blueprint (and its items)' })
  remove(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('blueprintId', ParseUUIDPipe) blueprintId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.service.remove(examId, blueprintId, actor);
  }

  @Permissions(PERMISSIONS.EXAM_READ)
  @Get(':blueprintId/plan')
  @ApiOperation({ summary: 'Dry-run the blueprint against the live pool: per-section supply + warnings' })
  plan(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('blueprintId', ParseUUIDPipe) blueprintId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BlueprintPlanDto> {
    return this.service.plan(examId, blueprintId, actor);
  }

  @Permissions(PERMISSIONS.EXAM_MANAGE)
  @Post(':blueprintId/items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a weighted item (rejects total weight > 100%)' })
  addItem(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('blueprintId', ParseUUIDPipe) blueprintId: string,
    @Body() dto: CreateExamBlueprintItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamBlueprintItemDto> {
    return this.service.addItem(examId, blueprintId, dto, actor);
  }

  @Permissions(PERMISSIONS.EXAM_MANAGE)
  @Patch(':blueprintId/items/:itemId')
  @ApiOperation({ summary: 'Update a blueprint item' })
  updateItem(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('blueprintId', ParseUUIDPipe) blueprintId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateExamBlueprintItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamBlueprintItemDto> {
    return this.service.updateItem(examId, blueprintId, itemId, dto, actor);
  }

  @Permissions(PERMISSIONS.EXAM_MANAGE)
  @Delete(':blueprintId/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a blueprint item' })
  removeItem(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('blueprintId', ParseUUIDPipe) blueprintId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.service.removeItem(examId, blueprintId, itemId, actor);
  }
}
