import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Field } from './entities/field.entity.js';
import { FieldType } from './entities/field-type.entity.js';
import { FieldImage } from './entities/field-image.entity.js';
import { FieldPrice } from './entities/field-price.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Field, FieldType, FieldImage, FieldPrice]),
  ],
  exports: [TypeOrmModule],
})
export class FieldsModule {}
