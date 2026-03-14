import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useStore } from "../../lib/store";
import ChatRoom, { type ChatMessage } from "../../components/ChatRoom";
import { colors } from "../../lib/theme";

export default function AirportScreen() {
  const { session, profile } = useStore();
  const [airportCode, setAirportCode] = useState("");
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(true);

  const loadMessages = useCallback(async (code: string) => {
    const { data } = await supabase
      .from("airport_messages")
      .select("*")
      .eq("airport_code", code)
      .order("created_at", { ascending: true })
      .limit(100);

    if (data) setMessages(data);
  }, []);

  useEffect(() => {
    if (!joined || !airportCode) return;

    const channel = supabase
      .channel(`airport-${airportCode}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "airport_messages",
          filter: `airport_code=eq.${airportCode}`,
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joined, airportCode]);

  function joinAirport() {
    const code = airportCode.trim().toUpperCase();
    if (!/^[A-Z]{3,4}$/.test(code)) return;
    setAirportCode(code);
    setJoined(true);
    loadMessages(code);
  }

  const handleSend = useCallback(
    async (content: string) => {
      if (!session || !profile) return;

      const { error } = await supabase.from("airport_messages").insert({
        airport_code: airportCode,
        user_id: session.user.id,
        pseudonym: "temp", // overwritten by DB trigger (set_airport_message_pseudonym)
        content,
      });

      if (error) {
        console.error("Airport send error:", error.message);
      }
    },
    [session, profile, airportCode]
  );

  if (!joined) {
    return (
      <View style={styles.container}>
        <View style={styles.joinContainer}>
          <Text style={styles.joinIcon}>🏢</Text>
          <Text style={styles.joinTitle}>Airport Chat</Text>
          <Text style={styles.joinSubtitle}>
            Join your airport's general room to chat with anyone here right now.
          </Text>
          <TextInput
            style={styles.airportInput}
            placeholder="Airport code (e.g., CLE)"
            placeholderTextColor={colors.slate500}
            value={airportCode}
            onChangeText={setAirportCode}
            autoCapitalize="characters"
            maxLength={4}
          />
          <TouchableOpacity style={styles.joinButton} onPress={joinAirport}>
            <Text style={styles.joinButtonText}>Join Room</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const header = (
    <View style={styles.roomHeader}>
      <Text style={styles.roomTitle}>{airportCode} General Chat</Text>
      <TouchableOpacity onPress={() => setJoined(false)}>
        <Text style={styles.leaveText}>Leave</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ChatRoom
      messages={messages}
      currentUserId={session?.user.id ?? ""}
      onSend={handleSend}
      placeholder="Message..."
      emptyTitle="No messages yet"
      emptyText="Be the first to say hi!"
      connected={connected}
      renderHeader={header}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate900,
  },
  joinContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  joinIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  joinTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.slate50,
    marginBottom: 8,
  },
  joinSubtitle: {
    fontSize: 15,
    color: colors.slate400,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  airportInput: {
    backgroundColor: colors.slate800,
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    color: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate700,
    textAlign: "center",
    width: "100%",
    letterSpacing: 4,
    fontWeight: "700",
  },
  joinButton: {
    backgroundColor: colors.blue500,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    width: "100%",
    marginTop: 16,
  },
  joinButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
  },
  roomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate700,
  },
  roomTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.slate50,
  },
  leaveText: {
    color: colors.red500,
    fontSize: 14,
    fontWeight: "600",
  },
});
