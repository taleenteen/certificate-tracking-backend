import { Controller, Get, Header } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @Header('Content-Type', 'text/html')
  getWelcomePage(): string {
    return this.appService.getWelcomeHtml();
  }
}
