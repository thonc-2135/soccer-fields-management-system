import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import type { User } from '../users/entities/user.entity.js';
import { ListFieldsQueryDto } from './dto/list-fields-query.dto.js';
import { FieldsService } from './fields.service.js';

@ApiTags('fields')
@Controller('fields')
export class FieldsController {
  constructor(private readonly fieldsService: FieldsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List / search fields',
    description:
      'Public. All filters are optional and combined with AND. Send a token to get `isFavorite`.',
  })
  findAll(@Query() query: ListFieldsQueryDto, @CurrentUser() user?: User) {
    return this.fieldsService.findAll(query, user?.id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Field detail (images, price windows, type)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: User) {
    return this.fieldsService.findOne(id, user?.id);
  }
}
