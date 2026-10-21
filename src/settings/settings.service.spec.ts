import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Setting } from './entities/setting.entity.js';
import { SettingsService } from './settings.service.js';

describe('SettingsService', () => {
  let service: SettingsService;
  const repo = { findOne: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: getRepositoryToken(Setting), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(SettingsService);
  });

  it('parses numeric values and caches them', async () => {
    repo.findOne.mockResolvedValue({ key: 'slot_minutes', value: '60' });
    expect(await service.getSlotMinutes()).toBe(60);
    expect(await service.getSlotMinutes()).toBe(60);
    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });

  it('falls back when the key is missing or not a number', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    expect(await service.getNumber('x', 7)).toBe(7);
    repo.findOne.mockResolvedValueOnce({ key: 'y', value: 'abc' });
    expect(await service.getNumber('y', 9)).toBe(9);
  });
});
