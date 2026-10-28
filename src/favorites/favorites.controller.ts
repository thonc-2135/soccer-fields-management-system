import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import type { User } from '../users/entities/user.entity.js';
import { FavoritesService } from './favorites.service.js';

@ApiTags('favorites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class FavoritesController {
  constructor(private readonly service: FavoritesService) {}

  @Post('fields/:fieldId/favorite')
  @HttpCode(200)
  @ApiOperation({ summary: 'Add a field to my favorites (idempotent)' })
  add(
    @Param('fieldId', ParseIntPipe) fieldId: number,
    @CurrentUser() user: User,
  ) {
    return this.service.add(fieldId, user.id);
  }

  @Delete('fields/:fieldId/favorite')
  @ApiOperation({ summary: 'Remove a field from my favorites (idempotent)' })
  remove(
    @Param('fieldId', ParseIntPipe) fieldId: number,
    @CurrentUser() user: User,
  ) {
    return this.service.remove(fieldId, user.id);
  }

  @Get('favorites')
  @ApiOperation({ summary: 'My favorite fields, most recently added first' })
  findMine(@Query() query: PaginationQueryDto, @CurrentUser() user: User) {
    return this.service.findMine(user.id, query);
  }
}
