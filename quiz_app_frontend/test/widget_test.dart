import 'package:flutter_test/flutter_test.dart';

import 'package:quiz_app_frontend/main.dart';

void main() {
  testWidgets('Login screen shows brand', (WidgetTester tester) async {
    await tester.pumpWidget(const QuizApp());
    expect(find.text('QuizMaster 1-12'), findsOneWidget);
  });
}
