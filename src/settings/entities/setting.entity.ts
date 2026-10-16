import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Key/value system config, e.g. `weekend_surcharge_percent`, `slot_minutes`. */
@Entity('settings')
export class Setting {
  @PrimaryColumn({ length: 50 })
  key: string;

  @Column({ length: 255 })
  value: string;
}
