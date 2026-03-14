import { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useStore, type Flight, type FlightMember } from "../../lib/store";
import { formatDistanceToNow } from "date-fns";

interface Message {
  id: string;
  flight_id: string;
  user_id: string;
  pseudonym: string;
  content: string;
  message_type: string;
  created_at: string;
}

const STATUS_TAGS = [
  { key: "at_gate", label: "At Gate", color: "#22C55E" },
  { key: "on_plane", label: "On Plane", color: "#3B82F6" },
  { key: "in_security", label: "In Security", color: "#F59E0B" },
  { key: "delayed", label: "Delayed", color: "#EF4444" },
  { key: "rebooking", label: "Rebooking", color: "#A855F7" },
];

export default function FlightRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useStore();
  const navigation = useNavigation();

  const [flight, setFlight] = useState<Flight | null>(null);
  const [members, setMembers] = useState<FlightMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myMembership, setMyMembership] = useState<FlightMember | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const loadRoom = useCallback(async () => {
    if (!id || !session) return;

    // Load flight details
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

    // Load members
    const { data: memberData } = await supabase
      .from("flight_members")
      .select("*")
      .eq("flight_id", id);

    if (memberData) {
      setMembers(memberData);
      const me = memberData.find((m: FlightMember) => m.user_id === session.user.id);
      if (me) setMyMembership(me);
    }

    // Load messages
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
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

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
        () => {
          // Reload members on any change
          supabase
            .from("flight_members")
            .select("*")
            .eq("flight_id", id)
            .then(({ data }) => {
              if (data) setMembers(data);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(membersChannel);
    };
  }, [id]);

  async function sendMessage() {
    if (!newMessage.trim() || !session || !myMembership) return;

    const { error } = await supabase.from("messages").insert({
      flight_id: id,
      user_id: session.user.id,
      pseudonym: myMembership.pseudonym,
      content: newMessage.trim(),
      message_type: "chat",
    });

    if (!error) setNewMessage("");
  }

  async function updateStatusTag(tag: string) {
    if (!myMembership || !session) return;

    await supabase
      .from("flight_members")
      .update({ status_tag: tag })
      .eq("id", myMembership.id);

    // Also send a system message
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      {/* Flight info bar */}
      {flight && (
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
            {flight.delay_minutes > 0 && (
              <Text style={styles.flightBarDelay}>
                +{flight.delay_minutes} min delay
              </Text>
            )}
            <Text style={styles.flightBarMembers}>
              {members.length} travelers
            </Text>
          </View>

          {/* Status tags summary */}
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
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        renderItem={({ item }) => {
          const isMe = item.user_id === session?.user.id;
          const isSystem = item.message_type === "status_update";

          if (isSystem) {
            return (
              <View style={styles.systemMessage}>
                <Text style={styles.systemMessageText}>
                  {item.pseudonym} {item.content}
                </Text>
              </View>
            );
          }

          return (
            <View
              style={[styles.messageBubble, isMe && styles.myMessageBubble]}
            >
              <Text style={styles.messagePseudonym}>{item.pseudonym}</Text>
              <Text style={styles.messageContent}>{item.content}</Text>
              <Text style={styles.messageTime}>
                {formatDistanceToNow(new Date(item.created_at), {
                  addSuffix: true,
                })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatTitle}>You're the first one here!</Text>
            <Text style={styles.emptyChatText}>
              Messages from other passengers on this flight will appear here.
            </Text>
          </View>
        }
      />

      {/* Status picker */}
      {showStatusPicker && (
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
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
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
        <TextInput
          style={styles.messageInput}
          placeholder="Message your flight..."
          placeholderTextColor="#64748B"
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  flightBar: {
    backgroundColor: "#1E293B",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
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
    color: "#F8FAFC",
  },
  flightBarGate: {
    fontSize: 14,
    color: "#3B82F6",
    fontWeight: "600",
  },
  flightBarStatus: {
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "600",
  },
  flightBarDelay: {
    fontSize: 13,
    color: "#F59E0B",
    fontWeight: "600",
  },
  flightBarMembers: {
    fontSize: 13,
    color: "#64748B",
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
  messageList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    maxWidth: "85%",
    alignSelf: "flex-start",
  },
  myMessageBubble: {
    backgroundColor: "#1E3A5F",
    alignSelf: "flex-end",
  },
  messagePseudonym: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3B82F6",
    marginBottom: 4,
  },
  messageContent: {
    fontSize: 15,
    color: "#F8FAFC",
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 11,
    color: "#475569",
    marginTop: 4,
    textAlign: "right",
  },
  systemMessage: {
    alignItems: "center",
    marginVertical: 4,
  },
  systemMessageText: {
    fontSize: 13,
    color: "#64748B",
    fontStyle: "italic",
  },
  emptyChat: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyChatTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F8FAFC",
    marginBottom: 8,
  },
  emptyChatText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  statusPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#334155",
    backgroundColor: "#1E293B",
  },
  statusOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
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
  inputBar: {
    flexDirection: "row",
    padding: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#334155",
    gap: 8,
    alignItems: "flex-end",
  },
  statusButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  statusButtonText: {
    fontSize: 16,
  },
  messageInput: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: "#F8FAFC",
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: "#3B82F6",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
});
