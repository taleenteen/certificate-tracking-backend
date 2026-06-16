import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return welcome page HTML', () => {
      expect(appController.getWelcomePage()).toContain('<!DOCTYPE html>');
      expect(appController.getWelcomePage()).toContain('E-LICENSE PLATFORM');
    });
  });
});
