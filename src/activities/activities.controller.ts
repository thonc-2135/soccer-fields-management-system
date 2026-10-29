import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { User } from '../users/entities/user.entity.js';
import { ActivitiesService } from './activities.service.js';
import { ListActivitiesQueryDto } from './dto/list-activities-query.dto.js';

@ApiTags('activities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  @Get('me')
  @ApiOperation({ summary: 'My activity timeline, newest first' })
  findMine(@Query() query: ListActivitiesQueryDto, @CurrentUser() user: User) {
    return this.service.findMine(user.id, query);
  }
}
