import { useState, useEffect, useRef, useCallback } from "react";
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
import { supabase } from "../../lib/supabase";
import { useStore } from "../../lib/store";
import { formatDistanceToNow } from "date-fns";

interface AirportMessage {
  id: string;
  airport_code: string;
  user_id: string;
  pseudonym: string;
  content: string;
  created_at: string;
}

export default function AirportScreen() {
  const { session, profile } = useStore();
  const [airportCode, setAirportCode] = useState("");
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState<AirportMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const flatListRef = useRef<FlatList>(null);

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

    // Subscribe to new messages
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
          setMessages((prev) => [...prev, payload.new as AirportMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joined, airportCode]);

  function joinAirport() {
    const code = airportCode.trim().toUpperCase();
    if (code.length < 3) return;
    setAirportCode(code);
    setJoined(true);
    loadMessages(code);
  }

  async function sendMessage() {
    if (!newMessage.trim() || !session || !profile) return;

    const { error } = await supabase.from("airport_messages").insert({
      airport_code: airportCode,
      user_id: session.user.id,
      pseudonym: profile.pseudonym,
      content: newMessage.trim(),
    });

    if (!error) setNewMessage("");
  }

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
            placeholderTextColor="#64748B"
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <View style={styles.roomHeader}>
        <Text style={styles.roomTitle}>{airportCode} General Chat</Text>
        <TouchableOpacity onPress={() => setJoined(false)}>
          <Text style={styles.leaveText}>Leave</Text>
        </TouchableOpacity>
      </View>

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
            <Text style={styles.emptyChatText}>
              No messages yet. Be the first to say hi!
            </Text>
          </View>
        }
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.messageInput}
          placeholder="Message..."
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
    color: "#F8FAFC",
    marginBottom: 8,
  },
  joinSubtitle: {
    fontSize: 15,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  airportInput: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    color: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#334155",
    textAlign: "center",
    width: "100%",
    letterSpacing: 4,
    fontWeight: "700",
  },
  joinButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    width: "100%",
    marginTop: 16,
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  roomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  roomTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F8FAFC",
  },
  leaveText: {
    color: "#EF4444",
    fontSize: 14,
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
  emptyChat: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyChatText: {
    color: "#64748B",
    fontSize: 15,
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
