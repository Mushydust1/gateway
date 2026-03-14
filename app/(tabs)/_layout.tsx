import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../lib/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.slate800,
          borderTopColor: colors.slate700,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarActiveTintColor: colors.blue500,
        tabBarInactiveTintColor: colors.slate500,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
        headerStyle: {
          backgroundColor: colors.slate800,
        },
        headerTintColor: colors.slate50,
        headerTitleStyle: {
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "My Flights",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20 }}>✈</Text>
          ),
          headerTitle: "GateWay",
        }}
      />
      <Tabs.Screen
        name="airport"
        options={{
          title: "Airport",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20 }}>🏢</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20 }}>👤</Text>
          ),
        }}
      />
    </Tabs>
  );
}
