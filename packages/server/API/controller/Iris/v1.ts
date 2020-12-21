import {
  Controller,
  Deprecated,
  Get,
  OperationId,
  Query,
  Route,
  Tags,
} from 'tsoa';
import { convertDateToEpoch } from 'server/API/controller/Hafas/convertDateToEpoch';
import { getAbfahrten } from 'server/iris';
import { noncdRequest, openDataRequest } from 'server/iris/helper';
import wingInfo from 'server/iris/wings';
import type { AbfahrtenResult, WingDefinition } from 'types/iris';

@Route('/iris/v1')
export class IrisControllerv1 extends Controller {
  @Get('/wings/{rawId1}/{rawId2}')
  @Tags('IRIS')
  @Deprecated()
  @OperationId('WingInfo v1')
  async wings(rawId1: string, rawId2: string): Promise<WingDefinition<number>> {
    const wings = wingInfo(rawId1, rawId2);
    convertDateToEpoch(wings);
    // @ts-expect-error just converted
    return wings;
  }

  @Get('/abfahrten/{evaId}')
  @Tags('IRIS')
  @Deprecated()
  @OperationId('Abfahrten v1')
  async abfahrten(
    evaId: string,
    /**
     * in Minutes
     */
    @Query() lookahead?: number,
    /**
     * in Minutes
     */
    @Query() lookbehind?: number,
    @Query() type?: 'open' | 'default',
  ): Promise<AbfahrtenResult<number>> {
    if (evaId.length < 6) {
      throw {
        status: 400,
        error: 'Please provide a evaID',
      };
    }

    const abfahrten = await getAbfahrten(
      evaId,
      true,
      {
        lookahead,
        lookbehind,
      },
      type === 'open' ? openDataRequest : noncdRequest,
    );
    convertDateToEpoch(abfahrten);
    // @ts-expect-error we just converted
    return abfahrten;
  }
}
