import {
  HttpClientTestingModule,
  HttpTestingController
} from '@angular/common/http/testing';
import { getTestBed, inject, TestBed } from '@angular/core/testing';

import { PlacesService } from './places.service';

describe('PlacesService', () => {
  let httpClient: HttpTestingController,
    injector: TestBed,
    placesService: PlacesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PlacesService]
    });

    injector = getTestBed();
    placesService = injector.get(PlacesService);
    httpClient = injector.get(HttpTestingController);
  });

  afterEach(() => {
    httpClient.verify();
  });

  it('should be created', inject([PlacesService], (service: PlacesService) => {
    expect(service).toBeTruthy();
  }));

  describe('empty', () => {
    it('notifies with null', () => {
      const spy = jasmine.createSpy('subscriber spy');
      const places = placesService.places$;

      places.subscribe(spy);
      placesService.empty();

      expect(spy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith(null);
    });
  });

  describe('getPlaces', () => {
    it('calls http get', () => {
      let latitude, longitude;

      const placesJson = {
        event: {
          features: [
            { properties: { name: 'feature 1' } },
            { properties: { name: 'feature 2' } }
          ]
        }
      };

      latitude = 0;
      longitude = 0;
      placesService.getPlaces(latitude, longitude);

      const request = httpClient.expectOne(
        placesService.PLACES_URL +
          `?latitude=${latitude}&longitude=${longitude}&type=event`
      );

      expect(request.request.method).toBe('GET');
      request.flush(placesJson);

      placesService.places$.subscribe(places => {
        console.log('Places: ' + places);
        expect(places.length).toBe(2);
        expect(places[0].name).toEqual('feature 1');
        expect(places[1].name).toEqual('feature 2');
      });
    });

    it('handles errors', () => {
      let latitude, longitude;

      latitude = 0;
      longitude = 0;
      placesService.getPlaces(latitude, longitude);

      const request = httpClient.expectOne(
        placesService.PLACES_URL +
          `?latitude=${latitude}&longitude=${longitude}&type=event`
      );

      request.error(new ErrorEvent('You may safely ignore this error.'));

      placesService.places$.subscribe(result => {
        expect(result.length).toBe(0);
      });
    });
  });

  describe('buildUrl', () => {
    it('returns a url', () => {
      let url;

      const lat = 0;
      const lng = 0;

      url = placesService.buildUrl(lat, lng);

      expect(url.indexOf(`latitude=${lat}`)).not.toEqual(-1);
      expect(url.indexOf(`longitude=${lng}`)).not.toEqual(-1);
    });
    it('normalizes longitude in the url', () => {
      let lng, url;

      const lat = 0;
      lng = 720;

      url = placesService.buildUrl(lat, lng);

      expect(url.indexOf(`latitude=${lat}`)).not.toEqual(-1);
      expect(url.indexOf(`longitude=0`)).not.toEqual(-1);

      lng = -720;

      url = placesService.buildUrl(lat, lng);

      expect(url.indexOf(`latitude=${lat}`)).not.toEqual(-1);
      expect(url.indexOf(`longitude=0`)).not.toEqual(-1);
    });
  });
});
