import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { User } from '../users/entities/user.entity.js';
import { CreateReviewDto, UpdateReviewDto } from './dto/create-review.dto.js';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Get('fields/:fieldId/reviews')
  @ApiOperation({ summary: 'Reviews of a field, newest first (public)' })
  listForField(
    @Param('fieldId', ParseIntPipe) fieldId: number,
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.service.listForField(fieldId, query);
  }

  @Post('fields/:fieldId/reviews')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Review a field',
    description:
      'Needs an APPROVED or COMPLETED booking at the field (403 otherwise); one review per user per field (409).',
  })
  create(
    @Param('fieldId', ParseIntPipe) fieldId: number,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: User,
  ) {
    return this.service.create(fieldId, dto, user);
  }

  @Patch('reviews/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Edit my review' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReviewDto,
    @CurrentUser() user: User,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete('reviews/:id')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a review (its author or an admin)' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.remove(id, user);
  }
}
