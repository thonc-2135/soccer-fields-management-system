import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AdminFieldTypesService } from './admin-field-types.service.js';
import {
  CreateFieldTypeDto,
  UpdateFieldTypeDto,
} from './dto/field-type.dto.js';

@ApiTags('admin / field types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/field-types')
export class AdminFieldTypesController {
  constructor(private readonly service: AdminFieldTypesService) {}

  @Post()
  create(@Body() dto: CreateFieldTypeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFieldTypeDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Refused with 409 while fields still use the type' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
