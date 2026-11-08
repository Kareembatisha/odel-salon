import { Injectable } from "@angular/core";
import { Observable, delay, of } from "rxjs";

import { ApiResponse } from "@shared/model/api_response.model";
import { DashboardSummary } from "../model/dashboard.model";
import { IDashboardRepository } from "./dashboard.repository";

const MOCK_DELAY_MS = 700;

@Injectable({ providedIn: "root" })
export class DashboardMockRepository implements IDashboardRepository {
  getSummary(): Observable<ApiResponse<DashboardSummary>> {
    return of<ApiResponse<DashboardSummary>>({
      status: true,
      statusCode: 200,
      message: "OK",
      errors: null,
      meta: null,
      data: {
        bookingsToday: 42,
        bookingsTrendPct: 12,
        revenueToday: 18450,
        revenueTrendPct: 8,
        averageRating: 4.8,
        reviewCount: 126,
        chairs: [
          { type: "regular", total: 10, inUse: 6, locked: 1 },
          { type: "vip", total: 4, inUse: 3, locked: 0 },
        ],
        barbers: [
          { id: 1, name: "Karim Adel", state: "free" },
          { id: 2, name: "Youssef Nabil", state: "busy", freeAt: "14:45" },
          { id: 3, name: "Mostafa Saeed", state: "free" },
          { id: 4, name: "Hady Mahmoud", state: "busy", freeAt: "15:10" },
          { id: 5, name: "Adham Ragab", state: "free" },
        ],
        upcoming: [
          {
            id: 1,
            time: "14:30",
            customer: "Ahmed Samir",
            service: "Classic haircut + beard",
            barber: "Youssef Nabil",
            chairType: "vip",
            status: "in-progress",
          },
          {
            id: 2,
            time: "14:45",
            customer: "Mazen Hossam",
            service: "Fade haircut",
            barber: "Karim Adel",
            chairType: "regular",
            status: "confirmed",
          },
          {
            id: 3,
            time: "15:00",
            customer: "Tarek Fawzy",
            service: "Hair color",
            barber: "Hady Mahmoud",
            chairType: "vip",
            status: "confirmed",
          },
          {
            id: 4,
            time: "15:15",
            customer: "Omar Gad",
            service: "Beard trim",
            barber: "Mostafa Saeed",
            chairType: "regular",
            status: "pending",
          },
          {
            id: 5,
            time: "15:30",
            customer: "Sherif Anwar",
            service: "Keratin treatment",
            barber: "Adham Ragab",
            chairType: "vip",
            status: "confirmed",
          },
          {
            id: 6,
            time: "16:00",
            customer: "Yassin Magdy",
            service: "Kids haircut",
            barber: "Karim Adel",
            chairType: "regular",
            status: "pending",
          },
        ],
      },
    }).pipe(delay(MOCK_DELAY_MS));
  }
}
