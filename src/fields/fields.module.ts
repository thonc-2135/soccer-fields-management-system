import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../files/files.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AdminFieldTypesController } from './admin/admin-field-types.controller.js';
import { AdminFieldTypesService } from './admin/admin-field-types.service.js';
import { AdminFieldsController } from './admin/admin-fields.controller.js';
import { AdminFieldsService } from './admin/admin-fields.service.js';
import { FieldTypesController } from './field-types.controller.js';
import { FieldImage } from './entities/field-image.entity.js';
import { FieldPrice } from './entities/field-price.entity.js';
import { FieldType } from './entities/field-type.entity.js';
import { Field } from './entities/field.entity.js';
import { FieldsController } from './fields.controller.js';
import { FieldsService } from './fields.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Field, FieldType, FieldImage, FieldPrice]),
    SettingsModule,
    FilesModule,
  ],
  controllers: [
    FieldsController,
    FieldTypesController,
    AdminFieldsController,
    AdminFieldTypesController,
  ],
  providers: [FieldsService, AdminFieldsService, AdminFieldTypesService],
  exports: [TypeOrmModule, FieldsService],
})
export class FieldsModule {}
