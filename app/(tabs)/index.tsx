import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useStore, type Flight } from "../../lib/store";
import { generatePseudonym } from "../../lib/pseudonyms";
import { formatDistanceToNow } from "date-fns";
import { colors } from "../../lib/theme";

interface FlightWithMembership extends Flight {
  member_count: number;
  my_pseudonym: string;
  my_status_tag: string;
}

export default function MyFlightsScreen() {
  const { session } = useStore();
  const router = useRouter();
  const [flights, setFlights] = useState<FlightWithMembership[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [flightNumber, setFlightNumber] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadFlights = useCallback(async () => {
    if (!session) return;

    // Single query using foreign key join to avoid N+1
    const { data: memberships, error: memError } = await supabase
      .from("flight_members")
      .select("*, flights(*)")
      .eq("user_id", session.user.id)
      .order("joined_at", { ascending: false });

    if (memError || !memberships || memberships.length === 0) {
      setFlights([]);
      return;
    }

    // Build the list; member_count per flight from the memberships we already have
    // We still need counts, so do a single batched count query
    const flightIds = memberships.map((m) => m.flight_id);
    const { data: allMembers } = await supabase
      .from("flight_members")
      .select("flight_id")
      .in("flight_id", flightIds);

    const countMap: Record<string, number> = {};
    if (allMembers) {
      for (const m of allMembers) {
        countMap[m.flight_id] = (countMap[m.flight_id] || 0) + 1;
      }
    }

    const flightsWithCounts: FlightWithMembership[] = memberships
      .filter((m) => m.flights)
      .map((m: any) => ({
        ...m.flights,
        member_count: countMap[m.flight_id] ?? 0,
        my_pseudonym: m.pseudonym,
        my_status_tag: m.status_tag,
      }));

    setFlights(flightsWithCounts);
  }, [session]);

  useEffect(() => {
    loadFlights();
  }, [loadFlights]);

  async function onRefresh() {
    setRefreshing(true);
    await loadFlights();
    setRefreshing(false);
  }

  async function addFlight() {
    if (!session) return;

    if (!flightNumber.trim() || !flightDate.trim()) {
      Alert.alert("Error", "Please enter flight number and date");
      return;
    }

    // Normalize flight number: remove spaces, uppercase
    const normalized = flightNumber.replace(/\s+/g, "").toUpperCase();

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(flightDate.trim())) {
      Alert.alert("Error", "Please enter date as YYYY-MM-DD (e.g., 2026-11-26)");
      return;
    }

    setAdding(true);

    // Check if flight already exists in our DB
    let { data: existingFlight, error: lookupError } = await supabase
      .from("flights")
      .select("*")
      .eq("flight_number", normalized)
      .eq("flight_date", flightDate.trim())
      .maybeSingle();

    let flightId: string;

    if (existingFlight) {
      flightId = existingFlight.id;
    } else {
      // Validate flight via FlightAware Edge Function
      const { data: faData, error: faError } = await supabase.functions.invoke(
        "validate-flight",
        { body: { flight_number: normalized, flight_date: flightDate.trim() } }
      );

      // Build flight record — use FlightAware data if available, fallback to manual entry
      const flightRecord = {
        flight_number: normalized,
        flight_date: flightDate.trim(),
        departure_airport: faData?.found ? faData.departure_airport : "TBD",
        arrival_airport: faData?.found ? faData.arrival_airport : "TBD",
        scheduled_departure: faData?.found ? faData.scheduled_departure : null,
        scheduled_arrival: faData?.found ? faData.scheduled_arrival : null,
        actual_departure: faData?.found ? faData.actual_departure : null,
        actual_arrival: faData?.found ? faData.actual_arrival : null,
        status: faData?.found ? faData.status : "scheduled",
        delay_minutes: faData?.found ? faData.delay_minutes : 0,
        gate: faData?.found ? faData.gate : null,
        flightaware_id: faData?.found ? faData.flightaware_id : null,
      };

      // If FlightAware explicitly says not found (not just an API error), warn user
      if (faData && !faData.found && !faError) {
        Alert.alert(
          "Flight Not Found",
          "We couldn't verify this flight. It may not exist yet or the number may be wrong. Adding anyway.",
        );
      }

      const { data: newFlight, error: flightError } = await supabase
        .from("flights")
        .insert(flightRecord)
        .select()
        .single();

      if (flightError || !newFlight) {
        Alert.alert("Error", `Could not add flight: ${flightError?.message ?? "Unknown error"}`);
        setAdding(false);
        return;
      }

      flightId = newFlight.id;
    }

    // Join the flight (upsert to handle duplicates gracefully)
    const { error: memberError } = await supabase
      .from("flight_members")
      .upsert(
        {
          user_id: session.user.id,
          flight_id: flightId,
          pseudonym: generatePseudonym(),
          status_tag: "none",
        },
        { onConflict: "user_id,flight_id", ignoreDuplicates: true }
      );

    if (memberError) {
      Alert.alert("Error", `Could not join flight: ${memberError.message}`);
      setAdding(false);
      return;
    }

    setFlightNumber("");
    setFlightDate("");
    setShowAddModal(false);
    setAdding(false);
    await loadFlights();
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "on_time":
      case "scheduled":
        return colors.green500;
      case "delayed":
        return colors.amber500;
      case "cancelled":
        return colors.red500;
      case "in_air":
        return colors.blue500;
      case "landed":
        return colors.violet500;
      default:
        return colors.slate500;
    }
  }

  function renderFlightCard({ item }: { item: FlightWithMembership }) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/flight/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.flightNumber}>{item.flight_number}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) + "20" },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getStatusColor(item.status) },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(item.status) },
              ]}
            >
              {item.status.replace("_", " ").toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.cardRoute}>
          <Text style={styles.airport}>{item.departure_airport}</Text>
          <Text style={styles.routeArrow}>→</Text>
          <Text style={styles.airport}>{item.arrival_airport}</Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.date}>{item.flight_date}</Text>
          {(item.delay_minutes ?? 0) > 0 && (
            <Text style={styles.delay}>+{item.delay_minutes} min</Text>
          )}
          <Text style={styles.memberCount}>
            {item.member_count} {item.member_count === 1 ? "traveler" : "travelers"}
          </Text>
        </View>

        <View style={styles.cardPseudonym}>
          <Text style={styles.pseudonymLabel}>You are </Text>
          <Text style={styles.pseudonymValue}>{item.my_pseudonym}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={flights}
        keyExtractor={(item) => item.id}
        renderItem={renderFlightCard}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.blue500}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✈</Text>
            <Text style={styles.emptyTitle}>No flights yet</Text>
            <Text style={styles.emptySubtitle}>
              Add your flight to connect with fellow passengers
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddModal(true)}
      >
        <Text style={styles.addButtonText}>+ Add Flight</Text>
      </TouchableOpacity>

      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Flight</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.inputLabel}>Flight Number</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., UA1234"
              placeholderTextColor={colors.slate500}
              value={flightNumber}
              onChangeText={setFlightNumber}
              autoCapitalize="characters"
              autoFocus
            />

            <Text style={styles.inputLabel}>Date</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.slate500}
              value={flightDate}
              onChangeText={setFlightDate}
              keyboardType="numbers-and-punctuation"
            />

            <TouchableOpacity
              style={[styles.modalButton, adding && styles.buttonDisabled]}
              onPress={addFlight}
              disabled={adding}
            >
              <Text style={styles.modalButtonText}>
                {adding ? "Adding..." : "Join Flight Room"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.modalHint}>
              Enter your flight number exactly as it appears on your boarding
              pass. We'll verify it and add you to the room.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate900,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.slate800,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.slate700,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  flightNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.slate50,
    letterSpacing: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  cardRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  airport: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.slate300,
  },
  routeArrow: {
    fontSize: 18,
    color: colors.slate600,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  date: {
    fontSize: 14,
    color: colors.slate500,
  },
  delay: {
    fontSize: 14,
    color: colors.amber500,
    fontWeight: "600",
  },
  memberCount: {
    fontSize: 14,
    color: colors.blue500,
    fontWeight: "500",
    marginLeft: "auto",
  },
  cardPseudonym: {
    flexDirection: "row",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.slate700,
  },
  pseudonymLabel: {
    fontSize: 13,
    color: colors.slate500,
  },
  pseudonymValue: {
    fontSize: 13,
    color: colors.slate400,
    fontWeight: "600",
  },
  empty: {
    alignItems: "center",
    paddingTop: 120,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.slate50,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.slate500,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  addButton: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: colors.blue500,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  addButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.slate900,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate700,
  },
  modalCancel: {
    color: colors.blue500,
    fontSize: 16,
  },
  modalTitle: {
    color: colors.slate50,
    fontSize: 18,
    fontWeight: "700",
  },
  modalContent: {
    padding: 24,
    gap: 8,
  },
  inputLabel: {
    color: colors.slate400,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: colors.slate800,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate700,
  },
  modalButton: {
    backgroundColor: colors.blue500,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
  },
  modalHint: {
    color: colors.slate500,
    fontSize: 13,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 18,
  },
});
