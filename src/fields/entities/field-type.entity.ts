import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('field_types')
export class FieldType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100, unique: true })
  name: string;

  /** Players on the pitch, e.g. 14 for a 7-a-side field. */
  @Column({ type: 'int' })
  capacity: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
