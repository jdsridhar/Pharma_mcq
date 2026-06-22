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
  type MarkAllReadResultDto,
  type NotificationDto,
  PERMISSIONS,
  type Paginated,
} from '@pharmacy/contracts';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Permissions } from '../identity/decorators/permissions.decorator';
import { ListNotificationsQueryDto } from './dto/list-notifications.query.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notification')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Permissions(PERMISSIONS.NOTIFICATION_MANAGE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a templated notification to a user (admin)' })
  send(@Body() dto: SendNotificationDto): Promise<NotificationDto> {
    return this.service.notify(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'List the current user’s notifications (in-app feed)' })
  myFeed(
    @CurrentUser('id') userId: string,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<Paginated<NotificationDto>> {
    return this.service.listMine(userId, query);
  }

  @Post('me/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all of the current user’s notifications as read' })
  readAll(@CurrentUser('id') userId: string): Promise<MarkAllReadResultDto> {
    return this.service.markAllRead(userId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read' })
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<NotificationDto> {
    return this.service.markRead(userId, id);
  }
}
