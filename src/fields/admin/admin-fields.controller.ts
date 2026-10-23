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
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import {
  imageUploadOptions,
  MAX_FILES_PER_REQUEST,
} from '../../files/image-upload.options.js';
import { AdminFieldsService } from './admin-fields.service.js';
import { CreateFieldDto, UpdateFieldDto } from './dto/create-field.dto.js';
import { ListAdminFieldsQueryDto } from './dto/list-admin-fields-query.dto.js';
import { PriceWindowDto } from './dto/price-window.dto.js';

class ReplacePricesDto {
  @ApiProperty({ type: [PriceWindowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PriceWindowDto)
  prices: PriceWindowDto[];
}

@ApiTags('admin / fields')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/fields')
export class AdminFieldsController {
  constructor(private readonly service: AdminFieldsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a field with its price windows (and optionally a new field type)',
  })
  create(@Body() dto: CreateFieldDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all fields, including INACTIVE ones' })
  findAll(@Query() query: ListAdminFieldsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update a field; `prices` (if sent) replaces the price windows atomically',
  })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFieldDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Soft delete; refused while pending/approved upcoming bookings exist',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Put(':id/prices')
  @ApiOperation({ summary: 'Replace the price windows' })
  replacePrices(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplacePricesDto,
  ) {
    return this.service.replacePrices(id, dto.prices);
  }

  @Post(':id/images')
  @ApiOperation({
    summary: `Upload up to ${MAX_FILES_PER_REQUEST} images (JPEG/PNG/WebP, 5MB each); max 10 per field`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('images', MAX_FILES_PER_REQUEST, imageUploadOptions),
  )
  addImages(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.service.addImages(id, files);
  }

  @Patch(':id/images/:imageId/thumbnail')
  @HttpCode(204)
  setThumbnail(
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
  ) {
    return this.service.setThumbnail(id, imageId);
  }

  @Delete(':id/images/:imageId')
  @HttpCode(204)
  removeImage(
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
  ) {
    return this.service.removeImage(id, imageId);
  }
}
