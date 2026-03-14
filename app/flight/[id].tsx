import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useStore, type Flight, type FlightMember } from "../../lib/store";
import ChatRoom, { type ChatMessage } from "../../components/ChatRoom";
import { colors } from "../../lib/theme";

const STATUS_TAGS = [
  { key: "at_gate", label: "At Gate", color: colors.green500 },
  { key: "on_plane", label: "On Plane", color: colors.blue500 },
  { key: "in_security", label: "In Security", color: colors.amber500 },
  { key: "delayed", label: "Delayed", color: colors.red500 },
  { key: "rebooking", label: "Rebooking", color: colors.purple500 },
];

export default function FlightRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useStore();
  const navigation = useNavigation();

  const [flight, setFlight] = useState<Flight | null>(null);
  const [members, setMembers] = useState<FlightMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [myMembership, setMyMembership] = useState<FlightMember | null>(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [connected, setConnected] = useState(true);

  const loadRoom = useCallback(async () => {
    if (!id || !session) return;

    const { data: flightData } = await supabase
      .from("flights")
      .select("*")
      .eq("id", id)
      .single();

    if (flightData) {
      setFlight(flightData);
      navigation.setOptions({
        headerTitle: `${flightData.flight_number} — ${flightData.departure_airport} → ${flightData.arrival_airport}`,
      });
    }

    const { data: memberData } = await supabase
      .from("flight_members")
      .select("*")
      .eq("flight_id", id);

    if (memberData) {
      setMembers(memberData);
      const me = memberData.find((m: FlightMember) => m.user_id === session.user.id);
      if (me) setMyMembership(me);
    }

    const { data: messageData } = await supabase
      .from("messages")
      .select("*")
      .eq("flight_id", id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (messageData) setMessages(messageData);
  }, [id, session]);

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  // Realtime subscriptions
  useEffect(() => {
    if (!id) return;

    const messagesChannel = supabase
      .channel(`flight-messages-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `flight_id=eq.${id}`,
        },
        (payload) => {
          setMessages((prev) => {
            const next = [...prev, payload.new as ChatMessage];
            return next.length > 300 ? next.slice(-300) : next;
          });
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    const membersChannel = supabase
      .channel(`flight-members-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "flight_members",
          filter: `flight_id=eq.${id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMembers((prev) => [...prev, payload.new as FlightMember]);
          } else if (payload.eventType === "UPDATE") {
            setMembers((prev) =>
              prev.map((m) =>
                m.id === (payload.new as FlightMember).id
                  ? (payload.new as FlightMember)
                  : m
              )
            );
          } else if (payload.eventType === "DELETE") {
            setMembers((prev) =>
              prev.filter((m) => m.id !== (payload.old as { id: string }).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(membersChannel);
    };
  }, [id]);

  const handleSend = useCallback(
    async (content: string) => {
      if (!session || !myMembership) return;

      await supabase.from("messages").insert({
        flight_id: id,
        user_id: session.user.id,
        pseudonym: myMembership.pseudonym,
        content,
        message_type: "chat",
      });
    },
    [id, session, myMembership]
  );

  async function updateStatusTag(tag: string) {
    if (!myMembership || !session) return;

    await supabase
      .from("flight_members")
      .update({ status_tag: tag })
      .eq("id", myMembership.id);

    await supabase.from("messages").insert({
      flight_id: id,
      user_id: session.user.id,
      pseudonym: myMembership.pseudonym,
      content: `updated status to ${STATUS_TAGS.find((s) => s.key === tag)?.label}`,
      message_type: "status_update",
    });

    setMyMembership({ ...myMembership, status_tag: tag });
    setShowStatusPicker(false);
  }

  // Count members by status
  const statusCounts = members.reduce(
    (acc, m) => {
      if (m.status_tag && m.status_tag !== "none") {
        acc[m.status_tag] = (acc[m.status_tag] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  const renderSystemMessage = useCallback(
    (item: ChatMessage) => (
      <View style={styles.systemMessage}>
        <Text style={styles.systemMessageText}>
          {item.pseudonym} {item.content}
        </Text>
      </View>
    ),
    []
  );

  const flightHeader = flight ? (
    <View style={styles.flightBar}>
      <View style={styles.flightBarRow}>
        <Text style={styles.flightBarRoute}>
          {flight.departure_airport} → {flight.arrival_airport}
        </Text>
        {flight.gate && (
          <Text style={styles.flightBarGate}>Gate {flight.gate}</Text>
        )}
      </View>
      <View style={styles.flightBarRow}>
        <Text style={styles.flightBarStatus}>
          {flight.status.replace("_", " ").toUpperCase()}
        </Text>
        {(flight.delay_minutes ?? 0) > 0 && (
          <Text style={styles.flightBarDelay}>
            +{flight.delay_minutes} min delay
          </Text>
        )}
        <Text style={styles.flightBarMembers}>
          {members.length} travelers
        </Text>
      </View>

      {Object.keys(statusCounts).length > 0 && (
        <View style={styles.statusSummary}>
          {STATUS_TAGS.filter((s) => statusCounts[s.key]).map((s) => (
            <View
              key={s.key}
              style={[styles.statusChip, { backgroundColor: s.color + "20" }]}
            >
              <View
                style={[styles.statusChipDot, { backgroundColor: s.color }]}
              />
              <Text style={[styles.statusChipText, { color: s.color }]}>
                {statusCounts[s.key]} {s.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  ) : null;

  const statusPickerUI = showStatusPicker ? (
    <View style={styles.statusPicker}>
      {STATUS_TAGS.map((tag) => (
        <TouchableOpacity
          key={tag.key}
          style={[
            styles.statusOption,
            myMembership?.status_tag === tag.key && {
              backgroundColor: tag.color + "20",
              borderColor: tag.color,
            },
          ]}
          onPress={() => updateStatusTag(tag.key)}
        >
          <View
            style={[styles.statusOptionDot, { backgroundColor: tag.color }]}
          />
          <Text style={[styles.statusOptionText, { color: tag.color }]}>
            {tag.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  ) : null;

  const statusButton = (
    <View style={styles.statusButtonRow}>
      <TouchableOpacity
        style={styles.statusButton}
        onPress={() => setShowStatusPicker(!showStatusPicker)}
      >
        <Text style={styles.statusButtonText}>
          {myMembership?.status_tag && myMembership.status_tag !== "none"
            ? STATUS_TAGS.find((s) => s.key === myMembership.status_tag)
                ?.label ?? "📍"
            : "📍"}
        </Text>
      </TouchableOpacity>
      {statusPickerUI}
    </View>
  );

  return (
    <ChatRoom
      messages={messages}
      currentUserId={session?.user.id ?? ""}
      onSend={handleSend}
      placeholder="Message your flight..."
      emptyTitle="You're the first one here!"
      emptyText="Messages from other passengers on this flight will appear here."
      connected={connected}
      renderHeader={flightHeader}
      renderBeforeInput={statusButton}
      renderSystemMessage={renderSystemMessage}
    />
  );
}

const styles = StyleSheet.create({
  flightBar: {
    backgroundColor: colors.slate800,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate700,
  },
  flightBarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  flightBarRoute: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.slate50,
  },
  flightBarGate: {
    fontSize: 14,
    color: colors.blue500,
    fontWeight: "600",
  },
  flightBarStatus: {
    fontSize: 13,
    color: colors.slate400,
    fontWeight: "600",
  },
  flightBarDelay: {
    fontSize: 13,
    color: colors.amber500,
    fontWeight: "600",
  },
  flightBarMembers: {
    fontSize: 13,
    color: colors.slate500,
  },
  statusSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  statusChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  systemMessage: {
    alignItems: "center",
    marginVertical: 4,
  },
  systemMessageText: {
    fontSize: 13,
    color: colors.slate500,
    fontStyle: "italic",
  },
  statusButtonRow: {
    borderTopWidth: 0,
  },
  statusPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.slate700,
    backgroundColor: colors.slate800,
  },
  statusOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.slate700,
    gap: 6,
  },
  statusOptionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusOptionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  statusButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.slate800,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.slate700,
    marginLeft: 12,
    marginBottom: 4,
  },
  statusButtonText: {
    fontSize: 16,
  },
});
