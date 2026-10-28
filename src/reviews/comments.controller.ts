import {
  Body,
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
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Get('reviews/:id/comments')
  @ApiOperation({
    summary: 'Comment tree of a review (public)',
    description:
      'Paginated by root comment, oldest first; every root comes with all of its replies.',
  })
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.service.listForReview(id, query);
  }

  @Post('reviews/:id/comments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Comment on a review, or reply to a comment' })
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: User,
  ) {
    return this.service.create(id, dto, user);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Delete a comment and its replies (its author or an admin)',
  })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.remove(id, user);
  }
}
