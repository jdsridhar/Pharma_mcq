import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Paginated,
  type RevisionGenerateResultDto,
  type RevisionItemDto,
} from '@pharmacy/contracts';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { AddRevisionItemDto } from './dto/add-revision-item.dto';
import { GenerateFromWrongDto } from './dto/generate-from-wrong.dto';
import { ListRevisionQueueQueryDto } from './dto/list-revision-queue.query.dto';
import { ReviewRevisionItemDto } from './dto/review-revision-item.dto';
import { SnoozeRevisionItemDto } from './dto/snooze-revision-item.dto';
import { RevisionService } from './revision.service';

/** Revision is student-self: every route acts on the authenticated user. */
@ApiTags('Revision')
@ApiBearerAuth()
@Controller('revision')
export class RevisionController {
  constructor(private readonly service: RevisionService) {}

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a question to the revision queue' })
  add(
    @CurrentUser('id') userId: string,
    @Body() dto: AddRevisionItemDto,
  ): Promise<RevisionItemDto> {
    return this.service.addItem(userId, dto);
  }

  @Get('queue')
  @ApiOperation({ summary: 'List the revision queue (optional status filter, paginated)' })
  queue(
    @CurrentUser('id') userId: string,
    @Query() query: ListRevisionQueueQueryDto,
  ): Promise<Paginated<RevisionItemDto>> {
    return this.service.listQueue(userId, query);
  }

  @Get('due')
  @ApiOperation({ summary: 'List items due for review now' })
  due(@CurrentUser('id') userId: string): Promise<RevisionItemDto[]> {
    return this.service.listDue(userId);
  }

  @Post('items/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a review outcome and reschedule the item' })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReviewRevisionItemDto,
  ): Promise<RevisionItemDto> {
    return this.service.review(userId, id, dto);
  }

  @Post('items/:id/snooze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Snooze an item for a number of days' })
  snooze(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SnoozeRevisionItemDto,
  ): Promise<RevisionItemDto> {
    return this.service.snooze(userId, id, dto);
  }

  @Post('generate-from-wrong')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Populate the queue from the user’s recent wrong answers' })
  generate(
    @CurrentUser('id') userId: string,
    @Body() dto: GenerateFromWrongDto,
  ): Promise<RevisionGenerateResultDto> {
    return this.service.generateFromWrong(userId, dto);
  }
}
