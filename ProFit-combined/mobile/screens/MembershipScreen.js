// MembershipScreen — runs the binding auth sequence on mount and renders the
// member's status + attendance using a react-native-reusables Card and a lucide
// icon. Styling is NativeWind classes only. No business logic lives here; it
// just orchestrates the API client calls and displays the results.

import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "react-native-reusables";
import { CalendarCheck, UserCircle } from "lucide-react-native";

import { getAttendance, getMembership, login } from "../api/client";

// Dev credentials would come from a login form in a full build; the skeleton
// uses placeholders so the sequence is exercised end to end.
const DEMO_USERNAME = "member1";
const DEMO_PASSWORD = "pw-secret";

export default function MembershipScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [membership, setMembership] = useState(null);
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // 1) GET csrf -> 2) POST login (echo X-CSRFToken) -> 3) GET me ->
        // 4) GET attendance. See api/client.js and mobile/README.md.
        await login(DEMO_USERNAME, DEMO_PASSWORD);
        const me = await getMembership();
        const records = await getAttendance();
        if (!cancelled) {
          setMembership(me);
          setAttendance(Array.isArray(records) ? records : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-base text-gray-600">Loading membership…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-base text-red-600">{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4">
      <Card className="mb-4">
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <UserCircle color="#2563eb" size={22} />
            <CardTitle>Membership</CardTitle>
          </View>
        </CardHeader>
        <CardContent>
          <Text className="text-base text-gray-800">
            Status: {membership?.membership_status ?? "—"}
          </Text>
          <Text className="mt-1 text-sm text-gray-500">
            Expires: {membership?.expiry_date ?? "—"}
          </Text>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <CalendarCheck color="#16a34a" size={22} />
            <CardTitle>Recent attendance</CardTitle>
          </View>
        </CardHeader>
        <CardContent>
          {attendance.length === 0 ? (
            <Text className="text-sm text-gray-500">No check-ins yet.</Text>
          ) : (
            attendance.map((record) => (
              <Text key={record.id} className="py-1 text-base text-gray-800">
                {record.check_in_date}
              </Text>
            ))
          )}
        </CardContent>
      </Card>
    </ScrollView>
  );
}
