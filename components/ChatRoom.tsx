import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { formatDistanceToNow } from "date-fns";
import { colors } from "../lib/theme";

export interface ChatMessage {
  id: string;
  user_id: string;
  pseudonym: string;
  content: string;
  message_type?: string;
  created_at: string;
}

interface ChatRoomProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (content: string) => void | Promise<void>;
  placeholder: string;
  emptyTitle: string;
  emptyText: string;
  connected: boolean;
  renderHeader?: React.ReactNode;
  renderBeforeInput?: React.ReactNode;
  renderSystemMessage?: (item: ChatMessage) => React.ReactNode;
}

const MessageBubble = React.memo(function MessageBubble({
  item,
  isMe,
}: {
  item: ChatMessage;
  isMe: boolean;
}) {
  return (
    <View style={[styles.messageBubble, isMe && styles.myMessageBubble]}>
      <Text style={styles.messagePseudonym}>{item.pseudonym}</Text>
      <Text style={styles.messageContent}>{item.content}</Text>
      <Text style={styles.messageTime}>
        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
      </Text>
    </View>
  );
});

export default function ChatRoom({
  messages,
  currentUserId,
  onSend,
  placeholder,
  emptyTitle,
  emptyText,
  connected,
  renderHeader,
  renderBeforeInput,
  renderSystemMessage,
}: ChatRoomProps) {
  const [newMessage, setNewMessage] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      isNearBottomRef.current = distanceFromBottom < 100;
    },
    []
  );

  useEffect(() => {
    if (
      messages.length > prevMessageCountRef.current &&
      isNearBottomRef.current
    ) {
      // Small delay to let FlatList render the new item
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  function handleSend() {
    if (!newMessage.trim()) return;
    onSend(newMessage.trim());
    setNewMessage("");
  }

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isMe = item.user_id === currentUserId;
      const isSystem = item.message_type === "status_update";

      if (isSystem && renderSystemMessage) {
        return <>{renderSystemMessage(item)}</>;
      }

      if (isSystem) {
        return (
          <View style={styles.systemMessage}>
            <Text style={styles.systemMessageText}>
              {item.pseudonym} {item.content}
            </Text>
          </View>
        );
      }

      return <MessageBubble item={item} isMe={isMe} />;
    },
    [currentUserId, renderSystemMessage]
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      {!connected && (
        <View style={styles.reconnectBanner}>
          <Text style={styles.reconnectText}>Reconnecting...</Text>
        </View>
      )}

      {renderHeader}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.messageList}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        windowSize={10}
        maxToRenderPerBatch={15}
        removeClippedSubviews={true}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatTitle}>{emptyTitle}</Text>
            <Text style={styles.emptyChatText}>{emptyText}</Text>
          </View>
        }
      />

      {renderBeforeInput}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.messageInput}
          placeholder={placeholder}
          placeholderTextColor={colors.slate500}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={styles.sendButtonText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate900,
  },
  reconnectBanner: {
    backgroundColor: colors.amber500,
    paddingVertical: 6,
    alignItems: "center",
  },
  reconnectText: {
    color: colors.slate900,
    fontSize: 13,
    fontWeight: "600",
  },
  messageList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    backgroundColor: colors.slate800,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    maxWidth: "85%",
    alignSelf: "flex-start",
  },
  myMessageBubble: {
    backgroundColor: colors.blue900,
    alignSelf: "flex-end",
  },
  messagePseudonym: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.blue500,
    marginBottom: 4,
  },
  messageContent: {
    fontSize: 15,
    color: colors.slate50,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 11,
    color: colors.slate600,
    marginTop: 4,
    textAlign: "right",
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
  emptyChat: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyChatTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.slate50,
    marginBottom: 8,
  },
  emptyChatText: {
    fontSize: 14,
    color: colors.slate500,
    textAlign: "center",
    lineHeight: 20,
  },
  inputBar: {
    flexDirection: "row",
    padding: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: colors.slate700,
    gap: 8,
    alignItems: "flex-end",
  },
  messageInput: {
    flex: 1,
    backgroundColor: colors.slate800,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.slate50,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.blue500,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
  },
});
