import { addRandomUseragent } from 'business-hub/randomUseragent';
import { CacheDatabases, createNewCache } from 'server/cache';
import { differenceInHours, format } from 'date-fns';
import { JourneysApi, TransportType } from 'business-hub/generated/risJourneys';
import { risJourneysConfiguration } from 'business-hub/config';
import axios from 'axios';
import type {
  JourneyEventBased,
  JourneyMatch,
  StationShort,
  TransportPublic,
} from 'business-hub/generated/risJourneys';
import type { ParsedJourneyMatchResponse } from 'types/HAFAS/JourneyMatch';
import type { ParsedProduct } from 'types/HAFAS';
import type { Route$Stop } from 'types/routing';

const journeyFindCache = createNewCache<string, JourneyMatch[]>(
  CacheDatabases.JourneyFind,
  8 * 60 * 60,
);

const axiosWithTimeout = axios.create({
  timeout: 4500,
});
axiosWithTimeout.interceptors.request.use(addRandomUseragent);

const risJourneysClient = new JourneysApi(
  risJourneysConfiguration,
  undefined,
  axiosWithTimeout,
);

const longDistanceTypes: TransportType[] = [
  TransportType.HighSpeedTrain,
  TransportType.IntercityTrain,
];

const mapTransportToTrain = (transport: TransportPublic): ParsedProduct => ({
  name: `${transport.category} ${
    longDistanceTypes.includes(transport.type)
      ? transport.number
      : transport.line || transport.number
  }`,
  line: transport.line,
  type: transport.category,
  number: `${transport.number}`,
});

const mapStationShortToRouteStops = (station: StationShort): Route$Stop => ({
  station: {
    id: station.evaNumber,
    title: station.name,
  },
});

function mapToParsedJourneyMatchResponse(
  journeyMatch: JourneyMatch,
): ParsedJourneyMatchResponse {
  return {
    // Technically wrong!
    jid: journeyMatch.journeyID,
    train: mapTransportToTrain(journeyMatch.transport),
    stops: [],
    firstStop: mapStationShortToRouteStops(journeyMatch.originSchedule),
    lastStop: mapStationShortToRouteStops(journeyMatch.destinationSchedule),
  };
}
export async function findJourney(
  trainNumber: number,
  category?: string,
  date?: Date,
  onlyFv?: boolean,
  originEvaNumber?: string,
): Promise<JourneyMatch[]> {
  try {
    const isWithin30Hours = !date || differenceInHours(date, Date.now()) <= 30;
    const cacheKey = `${trainNumber}|${category}|${
      date && format(date, 'yyyy-MM-dd')
    }|${onlyFv ?? false}|${originEvaNumber}`;
    if (isWithin30Hours) {
      const cacheHit = await journeyFindCache.get(cacheKey);
      if (cacheHit) {
        return cacheHit;
      }
    }
    const result = await risJourneysClient.find({
      number: trainNumber,
      category,
      date: date && format(date, 'yyyy-MM-dd'),
      transports: onlyFv ? longDistanceTypes : undefined,
      originEvaNumber,
    });

    if (isWithin30Hours) {
      void journeyFindCache.set(cacheKey, result.data.journeys);
    }

    return result.data.journeys;
  } catch {
    return [];
  }
}

export async function findJourneyHafasCompatible(
  trainNumber: number,
  category?: string,
  date?: Date,
  onlyFv?: boolean,
): Promise<ParsedJourneyMatchResponse[]> {
  const risReuslt = await findJourney(trainNumber, category, date, onlyFv);

  return risReuslt.map(mapToParsedJourneyMatchResponse);
}

export async function getJourneyDetails(
  journeyId: string,
): Promise<JourneyEventBased | undefined> {
  try {
    const r = await risJourneysClient.journeyEventbasedById({
      journeyID: journeyId,
      includeJourneyReferences: true,
    });

    return r.data;
  } catch {
    return undefined;
  }
}