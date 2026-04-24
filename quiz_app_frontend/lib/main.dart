import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const QuizApp());
}

/// Lưu user đã đăng nhập để gửi header `x-user-id` (RBAC admin).
class ApiSession {
  static int? userId;
  static String? role;
  static String? token;

  static void setFromLogin(Map<String, dynamic> user, {String? accessToken}) {
    final id = user['id'];
    userId = id is int ? id : int.tryParse('$id');
    role = user['role'] as String? ?? 'user';
    token = accessToken;
  }

  static void clear() {
    userId = null;
    role = null;
    token = null;
  }

  static bool get isAdmin => role == 'admin';
  static bool get isManager => role == 'admin' || role == 'teacher';
}

String apiDifficultyFromUi(String value) {
  switch (value) {
    case 'Dễ':
      return 'De';
    case 'Trung bình':
      return 'Trung binh';
    case 'Khó':
      return 'Kho';
    default:
      return value;
  }
}

String uiDifficultyFromApi(String value) {
  switch (value) {
    case 'De':
      return 'Dễ';
    case 'Trung binh':
      return 'Trung bình';
    case 'Kho':
      return 'Khó';
    default:
      return value;
  }
}

class AppConfig {
  static String get baseUrl {
    if (kIsWeb) return 'http://localhost:3000/api';
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000/api';
    }
    return 'http://localhost:3000/api';
  }

  static String get apiHost => baseUrl.replaceFirst('/api', '');
}

class ApiService {
  Map<String, String> _hdr([Map<String, String>? extra]) {
    final m = <String, String>{...?extra};
    final token = ApiSession.token;
    if (token != null && token.isNotEmpty) {
      m['Authorization'] = 'Bearer $token';
    }
    if (ApiSession.userId != null) {
      m['x-user-id'] = '${ApiSession.userId}';
    }
    return m;
  }

  Future<Map<String, dynamic>> login(String username, String password) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username, 'password': password}),
    );
    if (response.statusCode != 200) throw Exception('Đăng nhập thất bại');
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> register({
    required String username,
    required String password,
    required String fullName,
    required int grade,
  }) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'username': username,
        'password': password,
        'fullName': fullName,
        'grade': grade,
      }),
    );
    Map<String, dynamic> body = {};
    try {
      body = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw Exception(
        'API đăng ký không trả về JSON hợp lệ. Hãy kiểm tra backend đang chạy đúng server và đúng cổng.',
      );
    }
    if (response.statusCode != 201) {
      throw Exception(body['message'] ?? 'Đăng ký thất bại');
    }
    return body;
  }

  Future<List<dynamic>> getGrades() async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/grades'),
      headers: _hdr(),
    );
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getSubjects(int grade) async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/subjects?grade=$grade'),
      headers: _hdr(),
    );
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getQuizzes({
    int? grade,
    String? subject,
    String? search,
    String? difficulty,
  }) async {
    final params = <String, String>{};
    if (grade != null) params['grade'] = '$grade';
    if (subject != null && subject.isNotEmpty) params['subject'] = subject;
    if (search != null && search.isNotEmpty) params['search'] = search;
    if (difficulty != null && difficulty != 'Tất cả') {
      params['difficulty'] = difficulty;
    }
    final uri = Uri.parse(
      '${AppConfig.baseUrl}/quizzes',
    ).replace(queryParameters: params);
    final response = await http.get(uri, headers: _hdr());
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> getQuizDetail(
    int id, {
    int? questionCount,
    bool shuffle = false,
  }) async {
    final params = <String, String>{};
    if (questionCount != null && questionCount > 0) {
      params['questionCount'] = '$questionCount';
    }
    if (shuffle) {
      params['shuffle'] = 'true';
    }
    final uri = Uri.parse(
      '${AppConfig.baseUrl}/quizzes/$id',
    ).replace(queryParameters: params.isEmpty ? null : params);
    final response = await http.get(uri, headers: _hdr());
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> submitAttempt({
    required int userId,
    required int quizId,
    required List<Map<String, dynamic>> answers,
  }) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/attempts'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({'userId': userId, 'quizId': quizId, 'answers': answers}),
    );
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getAttempts(int userId) async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/attempts?userId=$userId'),
      headers: _hdr(),
    );
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> getAttemptComparison({
    required int userId,
    required int quizId,
  }) async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/attempts/compare?userId=$userId&quizId=$quizId'),
      headers: _hdr(),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? 'Không tải được dữ liệu so sánh');
    }
    return body;
  }

  Future<Map<String, dynamic>> getStats(int userId) async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/attempts/stats?userId=$userId'),
      headers: _hdr(),
    );
    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    return {
      'totalAttempts': payload['totalAttempts'] ?? 0,
      'avgScore': payload['averageScore'] ?? 0,
      'bestScore': payload['bestScore'] ?? 0,
    };
  }

  Future<List<dynamic>> getRecommendations(int userId) async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/recommendations/$userId'),
      headers: _hdr(),
    );
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getFavorites(int userId) async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/favorites?userId=$userId'),
      headers: _hdr(),
    );
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getRankings({int? grade}) async {
    final uri = Uri.parse('${AppConfig.baseUrl}/rankings').replace(
      queryParameters: grade == null ? null : {'grade': '$grade'},
    );
    final response = await http.get(uri, headers: _hdr());
    return jsonDecode(response.body);
  }

  Future<void> toggleFavorite(int userId, int quizId, bool shouldAdd) async {
    final uri = Uri.parse('${AppConfig.baseUrl}/favorites');
    if (shouldAdd) {
      await http.post(
        uri,
        headers: _hdr({'Content-Type': 'application/json'}),
        body: jsonEncode({'userId': userId, 'quizId': quizId}),
      );
      return;
    }
    await http.delete(
      uri,
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({'userId': userId, 'quizId': quizId}),
    );
  }

  Future<Map<String, dynamic>> getAdminOverview() async {
    final r = await http.get(
      Uri.parse('${AppConfig.baseUrl}/admin/overview'),
      headers: _hdr(),
    );
    if (r.statusCode != 200) throw Exception('Không tải được tổng quan');
    return jsonDecode(r.body);
  }

  Future<List<dynamic>> getAdminUsers() async {
    final r = await http.get(
      Uri.parse('${AppConfig.baseUrl}/admin/users'),
      headers: _hdr(),
    );
    if (r.statusCode != 200) throw Exception('Không tải danh sách người dùng');
    return jsonDecode(r.body);
  }

  Future<List<dynamic>> getAdminQuizzes({int limit = 50, int offset = 0}) async {
    final u = Uri.parse('${AppConfig.baseUrl}/admin/quizzes').replace(
      queryParameters: {'limit': '$limit', 'offset': '$offset'},
    );
    final r = await http.get(u, headers: _hdr());
    if (r.statusCode != 200) throw Exception('Không tải danh sách đề');
    return jsonDecode(r.body);
  }

  Future<Map<String, dynamic>> getAdminQuizDetail(int id) async {
    final r = await http.get(
      Uri.parse('${AppConfig.baseUrl}/admin/quizzes/$id'),
      headers: _hdr(),
    );
    final body = jsonDecode(r.body);
    if (r.statusCode != 200) throw Exception(body['message'] ?? 'Không tải được chi tiết đề');
    return body;
  }

  Future<void> deleteAdminQuiz(int id) async {
    final r = await http.delete(
      Uri.parse('${AppConfig.baseUrl}/admin/quizzes/$id'),
      headers: _hdr(),
    );
    if (r.statusCode != 200) throw Exception('Xóa đề thất bại');
  }

  Future<void> createAdminQuiz({
    required int grade,
    required String subject,
    required String title,
    String difficulty = 'Trung binh',
    int durationMinutes = 20,
    required List<Map<String, dynamic>> questions,
  }) async {
    final r = await http.post(
      Uri.parse('${AppConfig.baseUrl}/admin/quizzes'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({
        'grade': grade,
        'subject': subject,
        'title': title,
        'difficulty': difficulty,
        'durationMinutes': durationMinutes,
        'questions': questions,
      }),
    );
    if (r.statusCode != 201) throw Exception('Tạo đề thất bại');
  }

  Future<void> updateAdminQuiz({
    required int id,
    required int grade,
    required String subject,
    required String title,
    String difficulty = 'Trung binh',
    int durationMinutes = 20,
    required List<Map<String, dynamic>> questions,
  }) async {
    final r = await http.put(
      Uri.parse('${AppConfig.baseUrl}/admin/quizzes/$id'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({
        'grade': grade,
        'subject': subject,
        'title': title,
        'difficulty': difficulty,
        'durationMinutes': durationMinutes,
        'questions': questions,
      }),
    );
    if (r.statusCode != 200) throw Exception('Sửa đề thất bại');
  }

  Future<void> updateAdminUserRole(int userId, String role) async {
    final r = await http.patch(
      Uri.parse('${AppConfig.baseUrl}/admin/users/$userId/role'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({'role': role}),
    );
    if (r.statusCode != 200) throw Exception('Cập nhật vai trò thất bại');
  }

  Future<List<dynamic>> getManagedStudents({int? grade, String? q}) async {
    final params = <String, String>{};
    if (grade != null) params['grade'] = '$grade';
    if (q != null && q.trim().isNotEmpty) params['q'] = q.trim();
    final uri = Uri.parse('${AppConfig.baseUrl}/admin/students').replace(
      queryParameters: params.isEmpty ? null : params,
    );
    final r = await http.get(uri, headers: _hdr());
    if (r.statusCode != 200) throw Exception('Không tải được danh sách học sinh');
    return jsonDecode(r.body);
  }

  Future<void> createStudent({
    required String studentCode,
    required String fullName,
    required int grade,
  }) async {
    final r = await http.post(
      Uri.parse('${AppConfig.baseUrl}/admin/students'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({'studentCode': studentCode, 'fullName': fullName, 'grade': grade}),
    );
    if (r.statusCode != 201) throw Exception('Thêm học sinh thất bại');
  }

  Future<void> updateStudent({
    required int id,
    required String studentCode,
    required String fullName,
    required int grade,
  }) async {
    final r = await http.put(
      Uri.parse('${AppConfig.baseUrl}/admin/students/$id'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({'studentCode': studentCode, 'fullName': fullName, 'grade': grade}),
    );
    if (r.statusCode != 200) throw Exception('Sửa học sinh thất bại');
  }

  Future<void> deleteStudent(int id) async {
    final r = await http.delete(
      Uri.parse('${AppConfig.baseUrl}/admin/students/$id'),
      headers: _hdr(),
    );
    if (r.statusCode != 200) throw Exception('Xóa học sinh thất bại');
  }

  Future<void> importStudentsCsv({
    required Uint8List bytes,
    required String filename,
  }) async {
    final req = http.MultipartRequest(
      'POST',
      Uri.parse('${AppConfig.baseUrl}/admin/students/import-csv'),
    );
    req.headers.addAll(_hdr());
    req.files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
    final streamed = await req.send();
    final response = await http.Response.fromStream(streamed);
    final body = jsonDecode(response.body);
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? 'Import CSV thất bại');
    }
  }

  Future<String> exportStudentsCsv({int? grade, String? q}) async {
    final params = <String, String>{};
    if (grade != null) params['grade'] = '$grade';
    if (q != null && q.trim().isNotEmpty) params['q'] = q.trim();
    final uri = Uri.parse('${AppConfig.baseUrl}/admin/students/export').replace(
      queryParameters: params.isEmpty ? null : params,
    );
    final r = await http.get(uri, headers: _hdr());
    if (r.statusCode != 200) throw Exception('Xuất CSV thất bại');
    return r.body;
  }

  Future<void> resetStudentsPassword({
    List<String>? studentCodes,
    int? grade,
    required String newPassword,
  }) async {
    final r = await http.post(
      Uri.parse('${AppConfig.baseUrl}/admin/students/reset-password'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({
        'studentCodes': studentCodes ?? [],
        'grade': grade,
        'newPassword': newPassword,
      }),
    );
    if (r.statusCode != 200) throw Exception('Reset mật khẩu thất bại');
  }

  Future<List<dynamic>> getAdminAttempts({int limit = 100}) async {
    final u = Uri.parse('${AppConfig.baseUrl}/admin/attempts').replace(
      queryParameters: {'limit': '$limit'},
    );
    final r = await http.get(u, headers: _hdr());
    if (r.statusCode != 200) throw Exception('Không tải được lịch sử thi');
    return jsonDecode(r.body);
  }

  Future<void> deleteAdminAttempt(int id) async {
    final r = await http.delete(
      Uri.parse('${AppConfig.baseUrl}/admin/attempts/$id'),
      headers: _hdr(),
    );
    if (r.statusCode != 200) throw Exception('Xóa lượt thi thất bại');
  }

  Future<void> clearAdminAttempts() async {
    final r = await http.delete(
      Uri.parse('${AppConfig.baseUrl}/admin/attempts'),
      headers: _hdr(),
    );
    if (r.statusCode != 200) throw Exception('Reset lượt thi thất bại');
  }

  Future<Map<String, dynamic>> autoGenerateQuiz({
    required int grade,
    required String subject,
    required String difficulty,
    required int questionCount,
    required int durationMinutes,
    required String title,
    String prompt = '',
  }) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/quizzes/auto-generate'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({
        'grade': grade,
        'subject': subject,
        'difficulty': difficulty,
        'questionCount': questionCount,
        'durationMinutes': durationMinutes,
        'title': title,
        'prompt': prompt,
      }),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 201) {
      throw Exception(body['message'] ?? 'Tạo đề AI thất bại');
    }
    return body;
  }

  Future<Map<String, dynamic>> getAdminAiConfig() async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/admin/ai-config'),
      headers: _hdr(),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? 'Không tải được cấu hình AI');
    }
    return body;
  }

  Future<Map<String, dynamic>> updateAdminAiConfig({
    required String apiKey,
    required List<String> apiKeys,
    required String model,
  }) async {
    final response = await http.patch(
      Uri.parse('${AppConfig.baseUrl}/admin/ai-config'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({'apiKey': apiKey, 'apiKeys': apiKeys, 'model': model}),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? 'Cập nhật cấu hình AI thất bại');
    }
    return body;
  }

  Future<List<dynamic>> getAdminAiDocuments() async {
    final response = await http.get(
      Uri.parse('${AppConfig.baseUrl}/admin/ai-documents'),
      headers: _hdr(),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? 'Không tải được tài liệu AI');
    }
    return body as List<dynamic>;
  }

  Future<void> createAdminAiDocument({
    required String title,
    required String content,
  }) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/admin/ai-documents'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({'title': title, 'content': content}),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 201) {
      throw Exception(body['message'] ?? 'Lưu tài liệu thất bại');
    }
  }

  Future<void> deleteAdminAiDocument(int id) async {
    final response = await http.delete(
      Uri.parse('${AppConfig.baseUrl}/admin/ai-documents/$id'),
      headers: _hdr(),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? 'Xóa tài liệu thất bại');
    }
  }

  Future<void> updateAdminAiDocument({
    required int id,
    required String title,
    required String content,
  }) async {
    final response = await http.put(
      Uri.parse('${AppConfig.baseUrl}/admin/ai-documents/$id'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({'title': title, 'content': content}),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? 'Sửa tài liệu thất bại');
    }
  }

  Future<Map<String, dynamic>> askAiChatbot(String question) async {
    final response = await http.post(
      Uri.parse('${AppConfig.baseUrl}/ai/chat'),
      headers: _hdr({'Content-Type': 'application/json'}),
      body: jsonEncode({'question': question}),
    );
    final body = jsonDecode(response.body);
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? 'AI Chatbot lỗi');
    }
    return body as Map<String, dynamic>;
  }

  Future<String> uploadAdminImage({
    required Uint8List bytes,
    required String filename,
  }) async {
    final req = http.MultipartRequest(
      'POST',
      Uri.parse('${AppConfig.baseUrl}/admin/upload-image'),
    );
    req.headers.addAll(_hdr());
    req.files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
    final streamed = await req.send();
    final response = await http.Response.fromStream(streamed);
    final body = jsonDecode(response.body);
    if (response.statusCode != 201) {
      throw Exception(body['message'] ?? 'Upload ảnh thất bại');
    }
    return (body['imageUrl'] ?? '').toString();
  }

  Future<void> uploadAdminAiDocumentFile({
    required Uint8List bytes,
    required String filename,
  }) async {
    final req = http.MultipartRequest(
      'POST',
      Uri.parse('${AppConfig.baseUrl}/admin/ai-documents/upload'),
    );
    req.headers.addAll(_hdr());
    req.files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
    final streamed = await req.send();
    final response = await http.Response.fromStream(streamed);
    final body = jsonDecode(response.body);
    if (response.statusCode != 201) {
      throw Exception(body['message'] ?? 'Upload tài liệu thất bại');
    }
  }
}

class QuizApp extends StatelessWidget {
  const QuizApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Luyện Thi Trắc Nghiệm',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6C63FF),
          brightness: Brightness.light,
          primary: const Color(0xFF4A3FCE),
          secondary: const Color(0xFF00B4D8),
        ),
        appBarTheme: const AppBarTheme(centerTitle: true, elevation: 0),
        cardTheme: CardThemeData(
          elevation: 3,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          clipBehavior: Clip.antiAlias,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      home: const LoginScreen(),
    );
  }
}

Widget buildAiChatbotFab(BuildContext context, ApiService api) {
  return FloatingActionButton.extended(
    heroTag: null,
    onPressed: () {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => AiChatbotScreen(api: api)),
      );
    },
    icon: const Icon(Icons.smart_toy_outlined),
    label: const Text('AI Chat'),
  );
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _api = ApiService();
  final _username = TextEditingController(text: 'student1');
  final _password = TextEditingController(text: '123456');
  bool _loading = false;
  String? _error;

  String _strengthLabel(String pwd) {
    final p = pwd;
    final length = p.length;
    final hasLower = RegExp(r'[a-z]').hasMatch(p);
    final hasUpper = RegExp(r'[A-Z]').hasMatch(p);
    final hasDigit = RegExp(r'\d').hasMatch(p);
    final hasSpecial = RegExp(r'[^A-Za-z0-9]').hasMatch(p);
    final variety = [hasLower, hasUpper, hasDigit, hasSpecial].where((x) => x).length;
    int score = 0;
    if (length >= 8) score += 1;
    if (length >= 12) score += 1;
    if (variety >= 2) score += 1;
    if (variety >= 3) score += 1;
    if (score >= 4) return 'Mạnh';
    if (score >= 2) return 'Trung bình';
    return 'Yếu';
  }

  double _strengthValue(String pwd) {
    final p = pwd;
    final length = p.length;
    final hasLower = RegExp(r'[a-z]').hasMatch(p);
    final hasUpper = RegExp(r'[A-Z]').hasMatch(p);
    final hasDigit = RegExp(r'\d').hasMatch(p);
    final hasSpecial = RegExp(r'[^A-Za-z0-9]').hasMatch(p);
    final variety = [hasLower, hasUpper, hasDigit, hasSpecial].where((x) => x).length;
    int score = 0;
    if (length >= 8) score += 1;
    if (length >= 12) score += 1;
    if (variety >= 2) score += 1;
    if (variety >= 3) score += 1;
    return (score / 4).clamp(0.0, 1.0);
  }

  Future<void> _openRegisterDialog() async {
    final fullNameCtrl = TextEditingController();
    final usernameCtrl = TextEditingController();
    final passwordCtrl = TextEditingController();
    final confirmPasswordCtrl = TextEditingController();
    int selectedGrade = 10;
    bool submitting = false;
    String? error;
    String strengthLabel = 'Yếu';
    double strengthValue = 0;

    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setLocalState) => AlertDialog(
            title: const Text('Đăng ký tài khoản'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: fullNameCtrl,
                    decoration: const InputDecoration(labelText: 'Họ tên'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: usernameCtrl,
                    decoration: const InputDecoration(labelText: 'Tên đăng nhập'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: passwordCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Mật khẩu'),
                    onChanged: (v) {
                      setLocalState(() {
                        strengthLabel = _strengthLabel(v);
                        strengthValue = _strengthValue(v);
                      });
                    },
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Độ mạnh: $strengthLabel',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: strengthLabel == 'Mạnh'
                            ? Colors.green
                            : strengthLabel == 'Trung bình'
                                ? Colors.orange
                                : Colors.red,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  LinearProgressIndicator(
                    value: strengthValue,
                    minHeight: 8,
                    borderRadius: BorderRadius.circular(999),
                    backgroundColor: Colors.black12,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      strengthLabel == 'Mạnh'
                          ? Colors.green
                          : strengthLabel == 'Trung bình'
                              ? Colors.orange
                              : Colors.red,
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: confirmPasswordCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Nhập lại mật khẩu'),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<int>(
                    initialValue: selectedGrade,
                    decoration: const InputDecoration(labelText: 'Lớp'),
                    items: List.generate(
                      12,
                      (i) => DropdownMenuItem<int>(value: i + 1, child: Text('Lớp ${i + 1}')),
                    ),
                    onChanged: (value) {
                      if (value != null) {
                        setLocalState(() => selectedGrade = value);
                      }
                    },
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 10),
                    Text(error!, style: const TextStyle(color: Colors.red)),
                  ]
                ],
              ),
            ),
            actions: [
              TextButton(onPressed: submitting ? null : () => Navigator.pop(ctx), child: const Text('Hủy')),
              FilledButton(
                onPressed: submitting
                    ? null
                    : () async {
                        setLocalState(() {
                          submitting = true;
                          error = null;
                        });
                        try {
                          final u = usernameCtrl.text.trim();
                          final p = passwordCtrl.text.trim();
                          final cp = confirmPasswordCtrl.text.trim();
                          if (u.isEmpty || fullNameCtrl.text.trim().isEmpty) {
                            throw Exception('Vui lòng nhập đầy đủ họ tên và tên đăng nhập');
                          }
                          if (p.length < 8) {
                            throw Exception('Mật khẩu tối thiểu 8 ký tự');
                          }
                          if (p.toLowerCase() == u.toLowerCase()) {
                            throw Exception('Mật khẩu không được trùng với tên đăng nhập');
                          }
                          if (p != cp) {
                            throw Exception('Mật khẩu nhập lại không khớp');
                          }
                          if (_strengthLabel(p) == 'Yếu') {
                            throw Exception('Mật khẩu quá yếu. Hãy kết hợp chữ và số (hoặc ký tự đặc biệt)');
                          }
                          await _api.register(
                            username: u,
                            password: p,
                            fullName: fullNameCtrl.text.trim(),
                            grade: selectedGrade,
                          );
                          if (!mounted) return;
                          Navigator.of(this.context).pop();
                          ScaffoldMessenger.of(this.context).showSnackBar(
                            const SnackBar(content: Text('Đăng ký thành công, hãy đăng nhập')),
                          );
                        } catch (e) {
                          setLocalState(() => error = '$e'.replaceFirst('Exception: ', ''));
                        } finally {
                          setLocalState(() => submitting = false);
                        }
                      },
                child: Text(submitting ? 'Đang tạo...' : 'Đăng ký'),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _doLogin() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _api.login(_username.text.trim(), _password.text.trim());
      if (!mounted) return;
      final user = data['user'] as Map<String, dynamic>;
      ApiSession.setFromLogin(user, accessToken: data['token']?.toString());
      final isManager = ApiSession.isManager;
      final next = isManager
          ? AdminShell(api: _api, user: user)
          : HomeScreen(api: _api, user: user);
      Navigator.pushReplacement(
        context,
        PageRouteBuilder(
          pageBuilder: (_, __, ___) => next,
          transitionsBuilder: (_, animation, __, child) =>
              FadeTransition(opacity: animation, child: child),
        ),
      );
    } catch (_) {
      setState(() => _error = 'Đăng nhập thất bại, vui lòng thử lại');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF5F4BDB), Color(0xFF5CC8FF), Color(0xFF46E0C5)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
          ),
          const Positioned(
            top: -70,
            right: -40,
            child: CircleAvatar(radius: 120, backgroundColor: Color(0x22FFFFFF)),
          ),
          const Positioned(
            bottom: -80,
            left: -30,
            child: CircleAvatar(radius: 140, backgroundColor: Color(0x1AFFFFFF)),
          ),
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 520),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x3D1A237E),
                      blurRadius: 30,
                      offset: Offset(0, 14),
                    )
                  ],
                ),
                child: Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 72,
                          height: 72,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              colors: [Color(0xFF5B5EEA), Color(0xFF33C3FF)],
                            ),
                          ),
                          child: const Icon(Icons.school_rounded, size: 40, color: Colors.white),
                        ),
                        const SizedBox(height: 14),
                        const Text(
                          'QuizMaster 1-12 ✨',
                          style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Ôn luyện trắc nghiệm thông minh',
                          style: TextStyle(color: Colors.grey.shade600),
                        ),
                        const SizedBox(height: 18),
                        TextField(
                          controller: _username,
                          decoration: const InputDecoration(
                            labelText: 'Tài khoản',
                            prefixIcon: Icon(Icons.person),
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _password,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'Mật khẩu',
                            prefixIcon: Icon(Icons.lock),
                          ),
                        ),
                        const SizedBox(height: 18),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            style: FilledButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            ),
                            onPressed: _loading ? null : _doLogin,
                            icon: _loading
                                ? const SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : const Icon(Icons.login),
                            label: Text(_loading ? 'Đang đăng nhập...' : 'Đăng nhập'),
                          ),
                        ),
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: _loading ? null : _openRegisterDialog,
                            icon: const Icon(Icons.person_add_alt_1),
                            label: const Text('Tạo tài khoản mới'),
                          ),
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 10),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: const Color(0x1AFF3B30),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              _error!,
                              style: const TextStyle(color: Color(0xFFD32F2F), fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                        const SizedBox(height: 12),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Trang quản trị (RBAC): chỉ hiện khi role = admin.
class AdminShell extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  const AdminShell({super.key, required this.api, required this.user});

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final isAdmin = ApiSession.isAdmin;
    final pages = <Widget>[
      _AdminOverviewTab(api: widget.api),
      _StudentManagementTab(api: widget.api),
      _AdminQuizzesTab(api: widget.api),
      if (isAdmin) _AdminAttemptsTab(api: widget.api),
      _AdminAiConfigTab(api: widget.api),
      _AdminAiDocumentsTab(api: widget.api),
    ];
    final destinations = <NavigationDestination>[
      const NavigationDestination(icon: Icon(Icons.dashboard), label: 'Tổng quan'),
      const NavigationDestination(icon: Icon(Icons.school), label: 'Học sinh'),
      const NavigationDestination(icon: Icon(Icons.quiz), label: 'Đề thi'),
      if (isAdmin) const NavigationDestination(icon: Icon(Icons.fact_check), label: 'Lượt thi'),
      const NavigationDestination(icon: Icon(Icons.key), label: 'Gemini API'),
      const NavigationDestination(icon: Icon(Icons.menu_book), label: 'Tài liệu AI'),
    ];
    if (_tab >= pages.length) _tab = 0;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Quản trị QuizMaster'),
        actions: [
          IconButton(
            tooltip: 'Đăng xuất',
            onPressed: () {
              ApiSession.clear();
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (_) => const LoginScreen()),
              );
            },
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: IndexedStack(
        index: _tab,
        children: pages,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: destinations,
      ),
    );
  }
}

class _AdminOverviewTab extends StatefulWidget {
  final ApiService api;
  const _AdminOverviewTab({required this.api});

  @override
  State<_AdminOverviewTab> createState() => _AdminOverviewTabState();
}

class _AdminOverviewTabState extends State<_AdminOverviewTab> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final overview = ApiSession.isAdmin
        ? await widget.api.getAdminOverview()
        : {
            'users': (await widget.api.getManagedStudents()).length,
            'quizzes': (await widget.api.getAdminQuizzes(limit: 500)).length,
            'questions': 0,
            'attempts': 0,
          };
    final attempts = ApiSession.isAdmin ? await widget.api.getAdminAttempts(limit: 500) : <dynamic>[];
    final rankings = await widget.api.getRankings();
    return {
      'overview': overview,
      'attempts': attempts,
      'rankings': rankings,
    };
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (_, snap) {
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final o = (snap.data!['overview'] as Map<String, dynamic>);
        final attempts = (snap.data!['attempts'] as List<dynamic>? ?? []);
        final rankings = (snap.data!['rankings'] as List<dynamic>? ?? []);
        final today = DateTime.now();
        final last7 = List.generate(7, (i) => DateTime(today.year, today.month, today.day).subtract(Duration(days: 6 - i)));
        final attemptsByDay = <String, int>{for (final d in last7) '${d.year}-${d.month}-${d.day}': 0};
        for (final a in attempts) {
          final dt = DateTime.tryParse('${a['submittedAt']}');
          if (dt == null) continue;
          final key = '${dt.year}-${dt.month}-${dt.day}';
          if (attemptsByDay.containsKey(key)) {
            attemptsByDay[key] = (attemptsByDay[key] ?? 0) + 1;
          }
        }
        final showRankings = rankings.take(10).toList();
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                gradient: const LinearGradient(
                  colors: [Color(0xFF5E60CE), Color(0xFF48BFE3)],
                ),
              ),
              child: Text(
                'Xin chào, ${ApiSession.isAdmin ? 'quản trị viên' : 'giáo viên'}',
                style: const TextStyle(fontSize: 28, color: Colors.white, fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _BigStat(label: 'Người dùng', value: '${o['users']}'),
                _BigStat(label: 'Đề thi', value: '${o['quizzes']}'),
                _BigStat(label: 'Câu hỏi', value: '${o['questions']}'),
                _BigStat(label: 'Lượt thi', value: '${o['attempts']}'),
              ],
            ),
            const SizedBox(height: 16),
            if (ApiSession.isAdmin) ...[
              const Text('Lượt thi 7 ngày gần đây', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              _MiniBarChart(values: attemptsByDay.values.toList()),
              const SizedBox(height: 16),
            ],
            const Text('Bảng xếp hạng', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            if (showRankings.isEmpty)
              const Center(child: Text('Chưa có dữ liệu xếp hạng'))
            else
              ...showRankings.asMap().entries.map((entry) {
                final i = entry.key;
                final r = entry.value as Map<String, dynamic>;
                final top = i < 3;
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: top ? Colors.orange : Colors.indigo,
                      child: Text('${i + 1}', style: const TextStyle(color: Colors.white)),
                    ),
                    title: Text('${r['fullName'] ?? ''}'),
                    subtitle: Text('Lớp ${r['grade']} • ${r['attempts']} lượt'),
                    trailing: Text(
                      '${r['averageScore']}',
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                  ),
                );
              }),
          ],
        );
      },
    );
  }
}

class _BigStat extends StatelessWidget {
  final String label;
  final String value;
  const _BigStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.85, end: 1),
      duration: const Duration(milliseconds: 400),
      builder: (_, scale, child) => Transform.scale(scale: scale, child: child),
      child: SizedBox(
        width: 150,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
                Text(label),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MiniBarChart extends StatelessWidget {
  final List<int> values;
  const _MiniBarChart({required this.values});

  @override
  Widget build(BuildContext context) {
    final maxVal = values.isEmpty ? 1 : values.reduce((a, b) => a > b ? a : b);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: values
              .map(
                (v) => Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: (v / (maxVal == 0 ? 1 : maxVal)).clamp(0, 1)),
                      duration: const Duration(milliseconds: 450),
                      builder: (_, h, __) => Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Text('$v', style: const TextStyle(fontSize: 11)),
                          const SizedBox(height: 4),
                          Container(
                            height: 80 * h,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(8),
                              gradient: const LinearGradient(
                                colors: [Color(0xFF90CAF9), Color(0xFF5E60CE)],
                                begin: Alignment.bottomCenter,
                                end: Alignment.topCenter,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              )
              .toList(),
        ),
      ),
    );
  }
}

class _StudentManagementTab extends StatefulWidget {
  final ApiService api;
  const _StudentManagementTab({required this.api});

  @override
  State<_StudentManagementTab> createState() => _StudentManagementTabState();
}

class _StudentManagementTabState extends State<_StudentManagementTab> {
  String _q = '';
  int? _grade;
  late Future<List<dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.getManagedStudents();
  }

  void _reload() {
    setState(() => _future = widget.api.getManagedStudents(grade: _grade, q: _q));
  }

  Future<void> _importCsv() async {
    final picked = await FilePicker.pickFiles(
      withData: true,
      type: FileType.custom,
      allowedExtensions: const ['csv'],
    );
    if (picked == null || picked.files.isEmpty || picked.files.single.bytes == null) return;
    await widget.api.importStudentsCsv(
      bytes: picked.files.single.bytes!,
      filename: picked.files.single.name,
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Import CSV thành công')));
    _reload();
  }

  Future<void> _exportCsv() async {
    final csv = await widget.api.exportStudentsCsv(grade: _grade, q: _q);
    await FilePicker.saveFile(
      fileName: 'students.csv',
      bytes: Uint8List.fromList(utf8.encode(csv)),
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã xuất CSV')));
  }

  Future<void> _resetPasswordDialog() async {
    final pwd = TextEditingController(text: '123456');
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Reset mật khẩu hàng loạt'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Reset theo lớp đang lọc. Nếu chưa chọn lớp sẽ reset tất cả học sinh.'),
            const SizedBox(height: 10),
            TextField(
              controller: pwd,
              decoration: const InputDecoration(labelText: 'Mật khẩu mới'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Hủy')),
          FilledButton(
            onPressed: () async {
              await widget.api.resetStudentsPassword(
                grade: _grade,
                newPassword: pwd.text.trim(),
              );
              if (!mounted) return;
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã reset mật khẩu')));
            },
            child: const Text('Thực hiện'),
          ),
        ],
      ),
    );
  }

  Future<void> _openStudentDialog({Map<String, dynamic>? student}) async {
    final code = TextEditingController(text: (student?['studentCode'] ?? '').toString());
    final name = TextEditingController(text: (student?['fullName'] ?? '').toString());
    int grade = (student?['grade'] as num?)?.toInt() ?? 10;
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(student == null ? 'Thêm học sinh' : 'Sửa học sinh'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: code, decoration: const InputDecoration(labelText: 'Mã học sinh')),
            const SizedBox(height: 8),
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Họ tên')),
            const SizedBox(height: 8),
            DropdownButtonFormField<int>(
              initialValue: grade,
              decoration: const InputDecoration(labelText: 'Lớp'),
              items: List.generate(12, (i) => DropdownMenuItem(value: i + 1, child: Text('Lớp ${i + 1}'))),
              onChanged: (v) => grade = v ?? grade,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Hủy')),
          FilledButton(
            onPressed: () async {
              if (student == null) {
                await widget.api.createStudent(
                  studentCode: code.text.trim(),
                  fullName: name.text.trim(),
                  grade: grade,
                );
              } else {
                await widget.api.updateStudent(
                  id: (student['id'] as num).toInt(),
                  studentCode: code.text.trim(),
                  fullName: name.text.trim(),
                  grade: grade,
                );
              }
              if (!mounted) return;
              Navigator.pop(context);
              _reload();
            },
            child: const Text('Lưu'),
          )
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<dynamic>>(
      future: _future,
      builder: (_, snap) {
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final students = snap.data!;
        return ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                SizedBox(
                  width: 220,
                  child: TextField(
                    decoration: const InputDecoration(
                      hintText: 'Tìm theo mã/tên',
                      prefixIcon: Icon(Icons.search),
                    ),
                    onChanged: (v) => _q = v,
                    onSubmitted: (_) => _reload(),
                  ),
                ),
                SizedBox(
                  width: 140,
                  child: DropdownButtonFormField<int>(
                    initialValue: _grade,
                    decoration: const InputDecoration(labelText: 'Lớp'),
                    items: [
                      const DropdownMenuItem<int>(value: null, child: Text('Tất cả')),
                      ...List.generate(12, (i) => DropdownMenuItem(value: i + 1, child: Text('Lớp ${i + 1}')))
                    ],
                    onChanged: (v) => _grade = v,
                  ),
                ),
                FilledButton.icon(
                  onPressed: _reload,
                  icon: const Icon(Icons.filter_alt),
                  label: const Text('Lọc'),
                ),
                FilledButton.tonalIcon(
                  onPressed: _importCsv,
                  icon: const Icon(Icons.upload_file),
                  label: const Text('Import CSV'),
                ),
                FilledButton.tonalIcon(
                  onPressed: _exportCsv,
                  icon: const Icon(Icons.download),
                  label: const Text('Export CSV'),
                ),
                FilledButton.tonalIcon(
                  onPressed: _resetPasswordDialog,
                  icon: const Icon(Icons.lock_reset),
                  label: const Text('Reset mật khẩu'),
                ),
                FilledButton.icon(
                  onPressed: () => _openStudentDialog(),
                  icon: const Icon(Icons.person_add),
                  label: const Text('Thêm học sinh'),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ...students.map((s) => Card(
                  child: ListTile(
                    leading: CircleAvatar(child: Text('${s['grade']}')),
                    title: Text('${s['fullName']} (${s['studentCode'] ?? 'N/A'})'),
                    subtitle: Text('@${s['username']}'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          onPressed: () => _openStudentDialog(student: s as Map<String, dynamic>),
                          icon: const Icon(Icons.edit_outlined),
                        ),
                        IconButton(
                          onPressed: () async {
                            await widget.api.deleteStudent((s['id'] as num).toInt());
                            _reload();
                          },
                          icon: const Icon(Icons.delete_outline, color: Colors.red),
                        ),
                      ],
                    ),
                  ),
                )),
          ],
        );
      },
    );
  }
}

class _AdminUsersTab extends StatefulWidget {
  final ApiService api;
  const _AdminUsersTab({required this.api});

  @override
  State<_AdminUsersTab> createState() => _AdminUsersTabState();
}

class _AdminUsersTabState extends State<_AdminUsersTab> {
  late Future<List<dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.getAdminUsers();
  }

  void _reload() {
    setState(() => _future = widget.api.getAdminUsers());
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<dynamic>>(
      future: _future,
      builder: (_, snap) {
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final list = snap.data!;
        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: list.length,
            itemBuilder: (_, i) {
              final u = list[i];
              final role = (u['role'] ?? 'user').toString();
              final nextRole = role == 'user' ? 'teacher' : role == 'teacher' ? 'admin' : 'user';
              return Card(
                child: ListTile(
                  leading: CircleAvatar(child: Text('${u['id']}')),
                  title: Text(u['fullName'] ?? ''),
                  subtitle: Text('@${u['username']} • ${u['studentCode'] ?? 'N/A'} • Lớp ${u['grade']} • $role'),
                  trailing: FilledButton.tonal(
                    onPressed: () async {
                      await widget.api.updateAdminUserRole((u['id'] as num).toInt(), nextRole);
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Đã đổi ${u['username']} -> $nextRole')),
                      );
                      _reload();
                    },
                    child: Text('Đổi quyền'),
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _AdminQuizzesTab extends StatefulWidget {
  final ApiService api;
  const _AdminQuizzesTab({required this.api});

  @override
  State<_AdminQuizzesTab> createState() => _AdminQuizzesTabState();
}

class _AdminQuizzesTabState extends State<_AdminQuizzesTab> {
  late Future<List<dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.getAdminQuizzes(limit: 100, offset: 0);
  }

  void _reload() {
    setState(() {
      _future = widget.api.getAdminQuizzes(limit: 100, offset: 0);
    });
  }

  Future<void> _createQuickQuiz() async {
    final now = DateTime.now();
    await widget.api.createAdminQuiz(
      grade: 12,
      subject: 'Toán',
      title: 'Đề nhanh admin ${now.hour}:${now.minute}:${now.second}',
      difficulty: 'Trung binh',
      durationMinutes: 20,
      questions: [
        {
          'content': 'Giá trị của 2^3 là bao nhiêu?',
          'options': ['6', '8', '9', '12'],
          'correctAnswer': 1,
          'explanation': '2^3 = 8',
          'imageUrl': ''
        }
      ],
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Đã tạo đề mẫu mới')),
    );
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<dynamic>>(
      future: _future,
      builder: (_, snap) {
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final list = snap.data!;
        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: ListView(
            padding: const EdgeInsets.all(8),
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton.icon(
                    onPressed: _createQuickQuiz,
                    icon: const Icon(Icons.add),
                    label: const Text('Tạo đề mẫu'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _reload,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Làm mới'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ...list.map((q) => Card(
                    child: ListTile(
                      title: Text(q['title'] ?? ''),
                      subtitle: Text('Lớp ${q['grade']} • ${q['subject']} • ${q['questionCount']} câu'),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.edit_outlined),
                            onPressed: () async {
                              await Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => AdminQuizEditorScreen(
                                    api: widget.api,
                                    quizId: (q['id'] as num).toInt(),
                                  ),
                                ),
                              );
                              if (mounted) _reload();
                            },
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline, color: Colors.red),
                            onPressed: () async {
                              final ok = await showDialog<bool>(
                                context: context,
                                builder: (_) => AlertDialog(
                                  title: const Text('Xóa đề?'),
                                  content: Text('Đề #${q['id']}'),
                                  actions: [
                                    TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Hủy')),
                                    FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Xóa')),
                                  ],
                                ),
                              );
                              if (ok == true && context.mounted) {
                                await widget.api.deleteAdminQuiz((q['id'] as num).toInt());
                                _reload();
                              }
                            },
                          ),
                        ],
                      ),
                    ),
                  )),
            ],
          ),
        );
      },
    );
  }
}

class _AdminAttemptsTab extends StatefulWidget {
  final ApiService api;
  const _AdminAttemptsTab({required this.api});

  @override
  State<_AdminAttemptsTab> createState() => _AdminAttemptsTabState();
}

class _AdminAttemptsTabState extends State<_AdminAttemptsTab> {
  late Future<List<dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.getAdminAttempts(limit: 120);
  }

  void _reload() {
    setState(() => _future = widget.api.getAdminAttempts(limit: 120));
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<dynamic>>(
      future: _future,
      builder: (_, snap) {
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final list = snap.data!;
        if (list.isEmpty) return const Center(child: Text('Chưa có lượt thi'));
        return ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.tonalIcon(
                onPressed: () async {
                  await widget.api.clearAdminAttempts();
                  _reload();
                },
                icon: const Icon(Icons.refresh),
                label: const Text('Reset lượt thi'),
              ),
            ),
            const SizedBox(height: 8),
            ...list.map((a) => Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: const Color(0xFFE8F5E9),
                      child: Text('${a['score']}'),
                    ),
                    title: Text('${a['fullName'] ?? a['username'] ?? 'Người dùng'} • ${a['quizTitle'] ?? 'Đề'}'),
                    subtitle: Text('${a['subject'] ?? ''} • ${a['correct']}/${a['total']} đúng'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${a['submittedAt']}'.split('T').first,
                          style: const TextStyle(fontSize: 12),
                        ),
                        IconButton(
                          onPressed: () async {
                            await widget.api.deleteAdminAttempt((a['id'] as num).toInt());
                            _reload();
                          },
                          icon: const Icon(Icons.delete_outline, color: Colors.red),
                        )
                      ],
                    ),
                  ),
                )),
          ],
        );
      },
    );
  }
}

class HomeScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  const HomeScreen({super.key, required this.api, required this.user});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  late Future<Map<String, dynamic>> _stats;
  late Future<List<dynamic>> _recommendations;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _stats = widget.api.getStats(widget.user['id']);
    _recommendations = widget.api.getRecommendations(widget.user['id']);
  }

  Future<void> _openExploreForSubject(String subject) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ExploreScreen(
          api: widget.api,
          user: widget.user,
          initialSubject: subject,
        ),
      ),
    );
    if (!mounted) return;
    setState(_reload);
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Đăng xuất'),
        content: const Text('Bạn có chắc muốn đăng xuất khỏi tài khoản hiện tại?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Hủy')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Đăng xuất')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    ApiSession.clear();
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: buildAiChatbotFab(context, widget.api),
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(
            pinned: true,
            expandedHeight: 200,
            title: const Text('Bảng điều khiển'),
            actions: [
              IconButton(
                tooltip: 'Đăng xuất',
                onPressed: _logout,
                icon: const Icon(Icons.logout_rounded),
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF5C6BC0), Color(0xFF26C6DA), Color(0xFF7E57C2)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.only(left: 18, right: 18, top: 90),
                  child: Text(
                    'Xin chào ${widget.user['fullName']}',
                    style: const TextStyle(fontSize: 24, color: Colors.white, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFFF8F5FF), Color(0xFFF0FBFF)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                children: [
                  FutureBuilder<Map<String, dynamic>>(
                    future: _stats,
                    builder: (_, snapshot) {
                      final stats = snapshot.data ?? {'totalAttempts': 0, 'avgScore': 0, 'bestScore': 0};
                      return _StatsRow(stats: stats);
                    },
                  ),
                  const SizedBox(height: 14),
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    childAspectRatio: 1.25,
                    children: [
                      _SubjectQuickTile(
                        title: 'Toán học',
                        imageUrl: 'https://images.unsplash.com/photo-1596495578065-6e0763fa1178?auto=format&fit=crop&w=600&q=60',
                        colors: const [Color(0xFF0091EA), Color(0xFF1565C0)],
                        onTap: () => _openExploreForSubject('Toán'),
                      ),
                      _SubjectQuickTile(
                        title: 'Vật lý',
                        imageUrl: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=600&q=60',
                        colors: const [Color(0xFFD81B60), Color(0xFF8E24AA)],
                        onTap: () => _openExploreForSubject('Vật lý'),
                      ),
                      _SubjectQuickTile(
                        title: 'Hóa học',
                        imageUrl: 'https://images.unsplash.com/photo-1603126857599-f6e157fa2fe6?auto=format&fit=crop&w=600&q=60',
                        colors: const [Color(0xFF00A86B), Color(0xFF00796B)],
                        onTap: () => _openExploreForSubject('Hóa học'),
                      ),
                      _SubjectQuickTile(
                        title: 'Tiếng Anh',
                        imageUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?auto=format&fit=crop&w=600&q=60',
                        colors: const [Color(0xFF5E60CE), Color(0xFF3A0CA3)],
                        onTap: () => _openExploreForSubject('Tiếng Anh'),
                      ),
                      _SubjectQuickTile(
                        title: 'Ngữ văn',
                        imageUrl: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=600&q=70',
                        colors: const [Color(0xFF3949AB), Color(0xFF1E88E5)],
                        onTap: () => _openExploreForSubject('Ngữ văn'),
                      ),
                      _SubjectQuickTile(
                        title: 'Sinh học',
                        imageUrl: 'https://images.unsplash.com/photo-1530026405186-ed1f139313f8?auto=format&fit=crop&w=600&q=70',
                        colors: const [Color(0xFF43A047), Color(0xFF00897B)],
                        onTap: () => _openExploreForSubject('Sinh học'),
                      ),
                      _SubjectQuickTile(
                        title: 'Lịch sử',
                        imageUrl: 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?auto=format&fit=crop&w=600&q=70',
                        colors: const [Color(0xFFF9A825), Color(0xFFF57F17)],
                        onTap: () => _openExploreForSubject('Lịch sử'),
                      ),
                      _SubjectQuickTile(
                        title: 'Địa lý',
                        imageUrl: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=70',
                        colors: const [Color(0xFF00ACC1), Color(0xFF0288D1)],
                        onTap: () => _openExploreForSubject('Lịch sử và Địa lý'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  _FeatureTile(
                    icon: Icons.auto_awesome,
                    title: 'Luyện thi nâng cao',
                    subtitle: 'Lọc theo lớp, môn, độ khó, tìm kiếm nhanh',
                    onTap: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => ExploreScreen(api: widget.api, user: widget.user),
                        ),
                      );
                      setState(_reload);
                    },
                  ),
                  _FeatureTile(
                    icon: Icons.smart_toy_outlined,
                    title: 'Tạo đề tự động bằng AI',
                    subtitle: 'Nhập lớp, môn, độ khó để AI sinh đề',
                    onTap: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AutoGenerateQuizScreen(api: widget.api, user: widget.user),
                        ),
                      );
                      if (!mounted) return;
                      setState(_reload);
                    },
                  ),
                  _FeatureTile(
                    icon: Icons.chat_bubble_outline,
                    title: 'AI Chatbot học tập',
                    subtitle: 'Hỏi mọi thắc mắc, xin lời giải chi tiết',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => AiChatbotScreen(api: widget.api),
                      ),
                    ),
                  ),
                  _FeatureTile(
                    icon: Icons.history_toggle_off,
                    title: 'Lịch sử và thống kê',
                    subtitle: 'Xem chi tiết các bài thi đã nộp',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => HistoryScreen(api: widget.api, user: widget.user),
                      ),
                    ),
                  ),
                  _FeatureTile(
                    icon: Icons.favorite,
                    title: 'Bộ sưu tập đề yêu thích',
                    subtitle: 'Lưu đề quan tâm để học lại nhanh',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => FavoritesScreen(api: widget.api, user: widget.user),
                      ),
                    ),
                  ),
                  _FeatureTile(
                    icon: Icons.emoji_events_rounded,
                    title: 'Bảng xếp hạng',
                    subtitle: 'So sánh điểm trung bình theo lớp',
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => RankingScreen(api: widget.api, user: widget.user),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Đề gợi ý cho bạn', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(height: 8),
                  FutureBuilder<List<dynamic>>(
                    future: _recommendations,
                    builder: (_, snapshot) {
                      if (!snapshot.hasData) return const LinearProgressIndicator();
                      final data = snapshot.data!;
                      if (data.isEmpty) return const Text('Chưa có đề gợi ý');
                      return Column(
                        children: data
                            .map((item) => _RecommendationCard(
                                  item: item,
                                  onTap: () async {
                                    await Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => QuizScreen(
                                          api: widget.api,
                                          user: widget.user,
                                          quizId: item['id'],
                                        ),
                                      ),
                                    );
                                    setState(_reload);
                                  },
                                ))
                            .toList(),
                      );
                    },
                  ),
                ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ExploreScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  final int? initialGrade;
  final String? initialSubject;
  const ExploreScreen({
    super.key,
    required this.api,
    required this.user,
    this.initialGrade,
    this.initialSubject,
  });

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  int? selectedGrade;
  String? selectedSubject;
  String difficulty = 'Tất cả';
  final _search = TextEditingController();
  List<dynamic> quizzes = [];
  List<dynamic> grades = [];
  List<dynamic> subjects = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    grades = await widget.api.getGrades();
    selectedGrade = widget.initialGrade ?? (widget.user['grade'] as int);

    if (widget.initialSubject != null) {
      // Nếu môn không có ở lớp hiện tại, tự tìm lớp đầu tiên có môn đó.
      bool foundSubject = false;
      for (final g in grades) {
        final gid = (g['id'] as num).toInt();
        final subs = await widget.api.getSubjects(gid);
        final has = subs.any((s) => s['name'] == widget.initialSubject);
        if (has) {
          selectedGrade = gid;
          subjects = subs;
          selectedSubject = widget.initialSubject;
          foundSubject = true;
          break;
        }
      }
      if (!foundSubject) {
        await _loadSubjects();
      }
    } else {
      await _loadSubjects();
    }
    await _loadQuizzes();
  }

  Future<void> _loadSubjects() async {
    subjects = await widget.api.getSubjects(selectedGrade ?? 1);
    if (subjects.isNotEmpty) selectedSubject = subjects.first['name'];
  }

  Future<void> _loadQuizzes() async {
    setState(() => loading = true);
    quizzes = await widget.api.getQuizzes(
      grade: selectedGrade,
      subject: selectedSubject,
      search: _search.text.trim(),
      difficulty: apiDifficultyFromUi(difficulty),
    );
    setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Khám phá đề thi')),
      floatingActionButton: buildAiChatbotFab(context, widget.api),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<int>(
                    initialValue: selectedGrade,
                    decoration: const InputDecoration(labelText: 'Lớp'),
                    items: grades
                        .map((g) => DropdownMenuItem<int>(value: g['id'], child: Text(g['name'])))
                        .toList(),
                    onChanged: (v) async {
                      if (v == null) return;
                      selectedGrade = v;
                      await _loadSubjects();
                      await _loadQuizzes();
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: selectedSubject,
                    decoration: const InputDecoration(labelText: 'Môn'),
                    items: subjects
                        .map((s) => DropdownMenuItem<String>(value: s['name'], child: Text(s['name'])))
                        .toList(),
                    onChanged: (v) async {
                      selectedSubject = v;
                      await _loadQuizzes();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _search,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search),
                      hintText: 'Tìm theo tên đề',
                    ),
                    onSubmitted: (_) => _loadQuizzes(),
                  ),
                ),
                const SizedBox(width: 10),
                DropdownButton<String>(
                  value: difficulty,
                  items: const ['Tất cả', 'Dễ', 'Trung bình', 'Khó']
                      .map((d) => DropdownMenuItem<String>(value: d, child: Text(d)))
                      .toList(),
                  onChanged: (v) async {
                    if (v == null) return;
                    setState(() => difficulty = v);
                    await _loadQuizzes();
                  },
                )
              ],
            ),
            const SizedBox(height: 10),
            Expanded(
              child: loading
                  ? const Center(child: CircularProgressIndicator())
                  : quizzes.isEmpty
                      ? const Center(child: Text('Không tìm thấy đề phù hợp'))
                      : ListView.builder(
                          itemCount: quizzes.length,
                          itemBuilder: (_, i) {
                            final q = quizzes[i];
                            return TweenAnimationBuilder<double>(
                              tween: Tween(begin: 0, end: 1),
                              duration: Duration(milliseconds: 250 + (i * 40)),
                              builder: (_, value, child) => Opacity(
                                opacity: value,
                                child: Transform.translate(
                                  offset: Offset(0, (1 - value) * 12),
                                  child: child,
                                ),
                              ),
                              child: Card(
                                child: ListTile(
                                  title: Text(q['title']),
                                  subtitle: Text(
                                    '${q['subject']} • ${uiDifficultyFromApi(q['difficulty'])} • ${q['questionCount']} câu',
                                  ),
                                  trailing: const Icon(Icons.play_arrow),
                                  onTap: () => Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => QuizScreen(
                                        api: widget.api,
                                        user: widget.user,
                                        quizId: q['id'],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
            )
          ],
        ),
      ),
    );
  }
}

class QuizScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  final int quizId;
  const QuizScreen({super.key, required this.api, required this.user, required this.quizId});

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  Map<String, dynamic>? quiz;
  final Map<int, int> selectedAnswers = {};
  bool loading = true;
  bool favorite = false;
  int _secondsLeft = 0;
  Timer? _timer;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadQuiz();
  }

  Future<void> _loadQuiz() async {
    final data = await widget.api.getQuizDetail(
      widget.quizId,
      questionCount: 40,
      shuffle: true,
    );
    final favorites = await widget.api.getFavorites(widget.user['id']);
    final minutes = (data['durationMinutes'] as num?)?.toInt() ?? 20;
    _timer?.cancel();
    _secondsLeft = minutes * 60;
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_secondsLeft <= 0) {
        t.cancel();
        _submit();
        return;
      }
      setState(() => _secondsLeft -= 1);
    });
    setState(() {
      quiz = data;
      loading = false;
      favorite = favorites.any((f) => f['id'] == widget.quizId);
    });
  }

  Future<void> _toggleFavorite() async {
    await widget.api.toggleFavorite(widget.user['id'], widget.quizId, !favorite);
    setState(() => favorite = !favorite);
  }

  Future<void> _submit() async {
    if (quiz == null || _submitting) return;
    _submitting = true;
    _timer?.cancel();
    final answers = selectedAnswers.entries
        .map((e) => {'questionId': e.key, 'selectedAnswer': e.value})
        .toList();
    try {
      final result = await widget.api.submitAttempt(
        userId: widget.user['id'],
        quizId: widget.quizId,
        answers: answers,
      );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => ResultScreen(result: result)),
      );
    } finally {
      _submitting = false;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _formatTime(int seconds) {
    final m = (seconds ~/ 60).toString().padLeft(2, '0');
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    if (loading || quiz == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final questions = quiz!['questions'] as List<dynamic>;
    final progress = selectedAnswers.length / questions.length;
    return Scaffold(
      appBar: AppBar(
        title: Text(quiz!['title']),
        actions: [
          IconButton(
            onPressed: _toggleFavorite,
            icon: Icon(favorite ? Icons.favorite : Icons.favorite_border),
          )
        ],
      ),
      floatingActionButton: buildAiChatbotFab(context, widget.api),
      body: Column(
        children: [
          LinearProgressIndicator(value: progress),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Tiến độ: ${selectedAnswers.length}/${questions.length} câu'),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE3F2FD),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    'Thời gian: ${_formatTime(_secondsLeft)}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              itemCount: questions.length,
              itemBuilder: (_, i) {
                final q = questions[i];
                final options = (q['options'] as List<dynamic>).cast<String>();
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Câu ${i + 1}: ${q['content']}'),
                        if ((q['imageUrl'] ?? '').toString().trim().isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Builder(
                            builder: (_) {
                              final raw = (q['imageUrl'] ?? '').toString().trim();
                              final imageSrc = raw.startsWith('http') ? raw : '${AppConfig.apiHost}$raw';
                              return ClipRRect(
                                borderRadius: BorderRadius.circular(10),
                                child: Image.network(
                                  imageSrc,
                                  height: 170,
                                  width: double.infinity,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                                ),
                              );
                            },
                          ),
                        ],
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: List.generate(options.length, (idx) {
                            final isSelected = selectedAnswers[q['id']] == idx;
                            return ChoiceChip(
                              label: Text(options[idx]),
                              selected: isSelected,
                              onSelected: (_) => setState(() => selectedAnswers[q['id']] = idx),
                            );
                          }),
                        )
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _submit,
                icon: const Icon(Icons.send),
                label: const Text('Nộp bài'),
              ),
            ),
          )
        ],
      ),
    );
  }
}

class ResultScreen extends StatelessWidget {
  final Map<String, dynamic> result;
  const ResultScreen({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Card(
          elevation: 8,
          margin: const EdgeInsets.all(24),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.emoji_events, color: Colors.orange, size: 62),
                const SizedBox(height: 10),
                Text('Điểm ${result['score']}',
                    style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text('Đúng ${result['correct']}/${result['total']} câu'),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => Navigator.popUntil(context, (route) => route.isFirst),
                  child: const Text('Về trang chủ'),
                )
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class HistoryScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  const HistoryScreen({super.key, required this.api, required this.user});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late Future<List<dynamic>> attempts;
  late Future<List<dynamic>> _allQuizzes;
  final Map<int, Future<Map<String, dynamic>>> _compareFutures = {};

  @override
  void initState() {
    super.initState();
    attempts = widget.api.getAttempts(widget.user['id']);
    _allQuizzes = widget.api.getQuizzes();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Lịch sử bài làm')),
      floatingActionButton: buildAiChatbotFab(context, widget.api),
      body: FutureBuilder<List<dynamic>>(
        future: attempts,
        builder: (_, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final list = snapshot.data!;
          if (list.isEmpty) return const Center(child: Text('Chưa có lịch sử'));
          return FutureBuilder<List<dynamic>>(
            future: _allQuizzes,
            builder: (_, quizSnap) {
              final titleById = <int, String>{};
              if (quizSnap.hasData) {
                for (final q in quizSnap.data!) {
                  final id = (q['id'] as num?)?.toInt();
                  if (id != null) {
                    titleById[id] = (q['title'] ?? 'Đề #$id').toString();
                  }
                }
              }

              final grouped = <int, List<dynamic>>{};
              for (final a in list) {
                final quizId = (a['quizId'] as num).toInt();
                grouped.putIfAbsent(quizId, () => []);
                grouped[quizId]!.add(a);
              }
              final quizIds = grouped.keys.toList()..sort();

              return ListView.builder(
                padding: const EdgeInsets.all(10),
                itemCount: quizIds.length,
                itemBuilder: (_, i) {
                  final quizId = quizIds[i];
                  final quizTitle = titleById[quizId] ?? 'Đề #$quizId';
                  final quizAttempts = [...grouped[quizId]!]..sort(
                      (a, b) => (b['submittedAt'] as String).compareTo(a['submittedAt'] as String),
                    );
                  final latest = quizAttempts.first;
                  _compareFutures.putIfAbsent(
                    quizId,
                    () => widget.api.getAttemptComparison(
                      userId: (widget.user['id'] as num).toInt(),
                      quizId: quizId,
                    ),
                  );

                  return Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ExpansionTile(
                      leading: CircleAvatar(child: Text('${latest['score']}')),
                      title: Text(quizTitle),
                      subtitle: Text(
                        '${quizAttempts.length} lần thi • Gần nhất: ${latest['correct']}/${latest['total']}',
                      ),
                      children: [
                        FutureBuilder<Map<String, dynamic>>(
                          future: _compareFutures[quizId],
                          builder: (_, cmpSnap) {
                            if (!cmpSnap.hasData) {
                              if (cmpSnap.hasError) {
                                return const Padding(
                                  padding: EdgeInsets.all(12),
                                  child: Text('Không tải được dữ liệu so sánh'),
                                );
                              }
                              return const Padding(
                                padding: EdgeInsets.all(12),
                                child: CircularProgressIndicator(),
                              );
                            }
                            final cmp = cmpSnap.data!;
                            final attemptsCmp = (cmp['attempts'] as List<dynamic>);
                            final latestTrend = (cmp['latestTrend'] ?? 'none').toString();
                            final trendText = switch (latestTrend) {
                              'up' => 'Xu hướng: tăng',
                              'down' => 'Xu hướng: giảm',
                              'same' => 'Xu hướng: giữ nguyên',
                              _ => 'Xu hướng: chưa có dữ liệu',
                            };
                            return Column(
                              children: [
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  child: Align(
                                    alignment: Alignment.centerLeft,
                                    child: Text(
                                      trendText,
                                      style: const TextStyle(fontWeight: FontWeight.w700),
                                    ),
                                  ),
                                ),
                                ...attemptsCmp.reversed.map((a) {
                                  final diff = (a['scoreDiffFromPrevious'] as num?)?.toInt() ?? 0;
                                  final diffLabel = diff > 0 ? '+$diff' : '$diff';
                                  final trend = (a['trend'] ?? 'same').toString();
                                  final icon = trend == 'up'
                                      ? Icons.trending_up
                                      : trend == 'down'
                                          ? Icons.trending_down
                                          : Icons.trending_flat;
                                  final color = trend == 'up'
                                      ? Colors.green
                                      : trend == 'down'
                                          ? Colors.red
                                          : Colors.blueGrey;
                                  return ListTile(
                                    leading: Icon(icon, color: color),
                                    title: Text('Điểm: ${a['score']} (${a['correct']}/${a['total']})'),
                                    subtitle: Text('So với lần trước: $diffLabel'),
                                    trailing: Text(
                                      (a['submittedAt'] as String).substring(0, 10),
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                  );
                                }),
                              ],
                            );
                          },
                        ),
                      ],
                    ),
                  );
                },
              );
            },
          );
        },
      ),
    );
  }
}

class FavoritesScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  const FavoritesScreen({super.key, required this.api, required this.user});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  late Future<List<dynamic>> favorites;

  @override
  void initState() {
    super.initState();
    favorites = widget.api.getFavorites(widget.user['id']);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Đề yêu thích')),
      floatingActionButton: buildAiChatbotFab(context, widget.api),
      body: FutureBuilder<List<dynamic>>(
        future: favorites,
        builder: (_, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final data = snapshot.data!;
          if (data.isEmpty) return const Center(child: Text('Bạn chưa lưu đề nào'));
          return ListView(
            children: data
                .map(
                  (item) => Card(
                    child: ListTile(
                      title: Text(item['title']),
                      subtitle: Text('${item['subject']} - Lớp ${item['grade']}'),
                    ),
                  ),
                )
                .toList(),
          );
        },
      ),
    );
  }
}

class RankingScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  const RankingScreen({super.key, required this.api, required this.user});

  @override
  State<RankingScreen> createState() => _RankingScreenState();
}

class _RankingScreenState extends State<RankingScreen> {
  late Future<List<dynamic>> _rankings;

  @override
  void initState() {
    super.initState();
    // Global leaderboard: all users see the same rankings
    _rankings = widget.api.getRankings();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Bảng xếp hạng')),
      floatingActionButton: buildAiChatbotFab(context, widget.api),
      body: FutureBuilder<List<dynamic>>(
        future: _rankings,
        builder: (_, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final data = snapshot.data!;
          if (data.isEmpty) {
            return const Center(child: Text('Chưa có dữ liệu xếp hạng'));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: data.length,
            itemBuilder: (_, i) {
              final row = data[i];
              final top = i < 3;
              final medal = i == 0
                  ? '🥇'
                  : i == 1
                      ? '🥈'
                      : i == 2
                          ? '🥉'
                          : null;
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: top ? Colors.orange : Colors.indigo,
                    child: Text('${i + 1}', style: const TextStyle(color: Colors.white)),
                  ),
                  title: Row(
                    children: [
                      Expanded(child: Text('${row['fullName']}')),
                      if (medal != null) Text(medal, style: const TextStyle(fontSize: 16)),
                    ],
                  ),
                  subtitle: Text('Số lần thi: ${row['attempts']}'),
                  trailing: Text(
                    '${row['averageScore']}',
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _AdminAiConfigTab extends StatefulWidget {
  final ApiService api;
  const _AdminAiConfigTab({required this.api});

  @override
  State<_AdminAiConfigTab> createState() => _AdminAiConfigTabState();
}

class _AdminAiConfigTabState extends State<_AdminAiConfigTab> {
  final _apiKeyCtrl = TextEditingController();
  final _apiKeysCtrl = TextEditingController();
  final _modelCtrl = TextEditingController(text: 'gemini-1.5-flash');
  bool _loading = true;
  String? _status;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final config = await widget.api.getAdminAiConfig();
      _modelCtrl.text = config['model']?.toString() ?? 'gemini-1.5-flash';
      final keys = (config['apiKeys'] as List<dynamic>? ?? [])
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .toList();
      _apiKeysCtrl.text = keys.join('\n');
      _status = (config['hasApiKey'] == true) ? 'Đã cấu hình API key' : 'Chưa có API key';
    } catch (e) {
      _status = '$e'.replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _loading = true);
    try {
      await widget.api.updateAdminAiConfig(
        apiKey: _apiKeyCtrl.text.trim(),
        apiKeys: _apiKeysCtrl.text
            .split(RegExp(r'\r?\n'))
            .map((e) => e.trim())
            .where((e) => e.isNotEmpty)
            .toList(),
        model: _modelCtrl.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã cập nhật cấu hình Gemini')),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() => _status = '$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _apiKeyCtrl.dispose();
    _apiKeysCtrl.dispose();
    _modelCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Quản lý Gemini API', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 10),
        TextField(
          controller: _apiKeyCtrl,
          obscureText: true,
          decoration: const InputDecoration(
            labelText: 'Gemini API key ưu tiên (tùy chọn)',
            hintText: 'Nhập key muốn ưu tiên dùng trước',
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _apiKeysCtrl,
          minLines: 3,
          maxLines: 6,
          decoration: const InputDecoration(
            labelText: 'Danh sách Gemini API key (mỗi dòng 1 key)',
            hintText: 'AIza...\\nAIza...\\nAIza...',
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _modelCtrl,
          decoration: const InputDecoration(
            labelText: 'Model',
            hintText: 'gemini-1.5-flash',
          ),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: _loading ? null : _save,
          icon: const Icon(Icons.save),
          label: Text(_loading ? 'Đang lưu...' : 'Lưu cấu hình'),
        ),
        if (_status != null) ...[
          const SizedBox(height: 10),
          Text(_status!),
        ],
      ],
    );
  }
}

class AutoGenerateQuizScreen extends StatefulWidget {
  final ApiService api;
  final Map<String, dynamic> user;
  const AutoGenerateQuizScreen({super.key, required this.api, required this.user});

  @override
  State<AutoGenerateQuizScreen> createState() => _AutoGenerateQuizScreenState();
}

class _AutoGenerateQuizScreenState extends State<AutoGenerateQuizScreen> {
  final _title = TextEditingController();
  final _subject = TextEditingController(text: 'Toán');
  final _prompt = TextEditingController();
  int _grade = 10;
  int _questionCount = 40;
  int _durationMinutes = 45;
  String _difficulty = 'Trung bình';
  bool _submitting = false;

  Future<void> _generate() async {
    setState(() => _submitting = true);
    try {
      final result = await widget.api.autoGenerateQuiz(
        grade: _grade,
        subject: _subject.text.trim(),
        difficulty: apiDifficultyFromUi(_difficulty),
        questionCount: _questionCount,
        durationMinutes: _durationMinutes,
        title: _title.text.trim(),
        prompt: _prompt.text.trim(),
      );
      if (!mounted) return;
      final quizId = (result['quizId'] as num).toInt();
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => QuizScreen(api: widget.api, user: widget.user, quizId: quizId),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _subject.dispose();
    _prompt.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tạo đề tự động bằng AI')),
      floatingActionButton: buildAiChatbotFab(context, widget.api),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _title,
            decoration: const InputDecoration(labelText: 'Tên đề (tùy chọn)'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _subject,
            decoration: const InputDecoration(labelText: 'Môn học'),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<int>(
            initialValue: _grade,
            decoration: const InputDecoration(labelText: 'Lớp'),
            items: List.generate(
              12,
              (i) => DropdownMenuItem<int>(value: i + 1, child: Text('Lớp ${i + 1}')),
            ),
            onChanged: (value) {
              if (value != null) setState(() => _grade = value);
            },
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _difficulty,
            decoration: const InputDecoration(labelText: 'Độ khó'),
            items: const ['Dễ', 'Trung bình', 'Khó']
                .map((d) => DropdownMenuItem<String>(value: d, child: Text(d)))
                .toList(),
            onChanged: (value) {
              if (value != null) setState(() => _difficulty = value);
            },
          ),
          const SizedBox(height: 10),
          TextFormField(
            initialValue: '40',
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Số câu'),
            onChanged: (value) {
              final parsed = int.tryParse(value);
              if (parsed != null) _questionCount = parsed;
            },
          ),
          const SizedBox(height: 10),
          TextFormField(
            initialValue: '45',
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Thời gian (phút)'),
            onChanged: (value) {
              final parsed = int.tryParse(value);
              if (parsed != null) _durationMinutes = parsed;
            },
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _prompt,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Yêu cầu thêm cho AI',
              hintText: 'Ví dụ: tập trung phần hình học không gian, có 20% câu vận dụng cao...',
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _submitting ? null : _generate,
            icon: const Icon(Icons.auto_awesome),
            label: Text(_submitting ? 'AI đang tạo đề...' : 'Tạo đề ngay'),
          ),
        ],
      ),
    );
  }
}

class AdminQuizEditorScreen extends StatefulWidget {
  final ApiService api;
  final int quizId;
  const AdminQuizEditorScreen({super.key, required this.api, required this.quizId});

  @override
  State<AdminQuizEditorScreen> createState() => _AdminQuizEditorScreenState();
}

class _AdminQuizEditorScreenState extends State<AdminQuizEditorScreen> {
  bool _loading = true;
  bool _saving = false;
  final _title = TextEditingController();
  final _subject = TextEditingController();
  int _grade = 10;
  int _duration = 20;
  String _difficulty = 'Trung binh';
  List<Map<String, dynamic>> _questions = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await widget.api.getAdminQuizDetail(widget.quizId);
    setState(() {
      _title.text = (data['title'] ?? '').toString();
      _subject.text = (data['subject'] ?? '').toString();
      _grade = (data['grade'] as num?)?.toInt() ?? 10;
      _duration = (data['durationMinutes'] as num?)?.toInt() ?? 20;
      _difficulty = (data['difficulty'] ?? 'Trung binh').toString();
      _questions = ((data['questions'] as List<dynamic>? ?? [])
          .map((q) => {
                'content': (q['content'] ?? '').toString(),
                'options': List<String>.from((q['options'] as List<dynamic>? ?? []).map((e) => '$e')),
                'correctAnswer': (q['correctAnswer'] as num?)?.toInt() ?? 0,
                'imageUrl': (q['imageUrl'] ?? '').toString(),
                'explanation': (q['explanation'] ?? '').toString(),
              })
          .toList());
      _loading = false;
    });
  }

  void _addQuestion() {
    setState(() {
      _questions.add({
        'content': '',
        'options': ['', '', '', ''],
        'correctAnswer': 0,
        'imageUrl': '',
        'explanation': '',
      });
    });
  }

  Future<void> _uploadQuestionImage(Map<String, dynamic> q) async {
    final picked = await FilePicker.pickFiles(
      withData: true,
      type: FileType.image,
    );
    if (picked == null || picked.files.isEmpty) return;
    final file = picked.files.single;
    if (file.bytes == null) return;
    try {
      final url = await widget.api.uploadAdminImage(
        bytes: file.bytes!,
        filename: file.name,
      );
      setState(() => q['imageUrl'] = url);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Upload ảnh thành công')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))),
      );
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await widget.api.updateAdminQuiz(
        id: widget.quizId,
        grade: _grade,
        subject: _subject.text.trim(),
        title: _title.text.trim(),
        difficulty: _difficulty,
        durationMinutes: _duration,
        questions: _questions,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã lưu đề thi')));
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _subject.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sửa đề thi'),
        actions: [
          IconButton(onPressed: _saving ? null : _save, icon: const Icon(Icons.save)),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _addQuestion,
        child: const Icon(Icons.add),
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          TextField(controller: _title, decoration: const InputDecoration(labelText: 'Tên đề')),
          const SizedBox(height: 8),
          TextField(controller: _subject, decoration: const InputDecoration(labelText: 'Môn học')),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<int>(
                  initialValue: _grade,
                  decoration: const InputDecoration(labelText: 'Lớp'),
                  items: List.generate(12, (i) => DropdownMenuItem(value: i + 1, child: Text('Lớp ${i + 1}'))),
                  onChanged: (v) => setState(() => _grade = v ?? _grade),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _difficulty,
                  decoration: const InputDecoration(labelText: 'Độ khó'),
                  items: const ['De', 'Trung binh', 'Kho']
                      .map((d) => DropdownMenuItem(value: d, child: Text(d)))
                      .toList(),
                  onChanged: (v) => setState(() => _difficulty = v ?? _difficulty),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextFormField(
            initialValue: '$_duration',
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Thời gian (phút)'),
            onChanged: (v) => _duration = int.tryParse(v) ?? _duration,
          ),
          const SizedBox(height: 12),
          ..._questions.asMap().entries.map((entry) {
            final i = entry.key;
            final q = entry.value;
            final opts = (q['options'] as List).map((e) => '$e').toList();
            while (opts.length < 4) {
              opts.add('');
            }
            q['options'] = opts;
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text('Câu ${i + 1}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        const Spacer(),
                        IconButton(
                          onPressed: () => setState(() => _questions.removeAt(i)),
                          icon: const Icon(Icons.delete_outline, color: Colors.red),
                        )
                      ],
                    ),
                    TextFormField(
                      initialValue: q['content'],
                      decoration: const InputDecoration(labelText: 'Nội dung câu hỏi'),
                      onChanged: (v) => q['content'] = v,
                    ),
                    const SizedBox(height: 6),
                    for (int j = 0; j < 4; j++)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: TextFormField(
                          initialValue: opts[j],
                          decoration: InputDecoration(labelText: 'Đáp án ${j + 1}'),
                          onChanged: (v) => opts[j] = v,
                        ),
                      ),
                    DropdownButtonFormField<int>(
                      initialValue: (q['correctAnswer'] as num?)?.toInt() ?? 0,
                      decoration: const InputDecoration(labelText: 'Đáp án đúng'),
                      items: const [
                        DropdownMenuItem(value: 0, child: Text('Đáp án 1')),
                        DropdownMenuItem(value: 1, child: Text('Đáp án 2')),
                        DropdownMenuItem(value: 2, child: Text('Đáp án 3')),
                        DropdownMenuItem(value: 3, child: Text('Đáp án 4')),
                      ],
                      onChanged: (v) => q['correctAnswer'] = v ?? 0,
                    ),
                    const SizedBox(height: 6),
                    TextFormField(
                      initialValue: q['imageUrl'],
                      decoration: const InputDecoration(labelText: 'Link ảnh minh họa (imageUrl)'),
                      onChanged: (v) => q['imageUrl'] = v,
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        OutlinedButton.icon(
                          onPressed: () => _uploadQuestionImage(q),
                          icon: const Icon(Icons.image_outlined),
                          label: const Text('Upload ảnh từ máy'),
                        ),
                        const SizedBox(width: 8),
                        if ((q['imageUrl'] ?? '').toString().trim().isNotEmpty)
                          const Text('Đã có ảnh', style: TextStyle(color: Colors.green)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    TextFormField(
                      initialValue: q['explanation'],
                      maxLines: 2,
                      decoration: const InputDecoration(labelText: 'Giải thích (tùy chọn)'),
                      onChanged: (v) => q['explanation'] = v,
                    ),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 80),
        ],
      ),
    );
  }
}

class _AdminAiDocumentsTab extends StatefulWidget {
  final ApiService api;
  const _AdminAiDocumentsTab({required this.api});

  @override
  State<_AdminAiDocumentsTab> createState() => _AdminAiDocumentsTabState();
}

class _AdminAiDocumentsTabState extends State<_AdminAiDocumentsTab> {
  late Future<List<dynamic>> _futureDocs;

  @override
  void initState() {
    super.initState();
    _futureDocs = widget.api.getAdminAiDocuments();
  }

  void _reload() {
    setState(() => _futureDocs = widget.api.getAdminAiDocuments());
  }

  Future<void> _openAddDialog() async {
    final titleCtrl = TextEditingController();
    final contentCtrl = TextEditingController();
    bool loading = false;
    String? err;

    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setLocalState) => AlertDialog(
            title: const Text('Thêm tài liệu huấn luyện AI'),
            content: SizedBox(
              width: 520,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: titleCtrl,
                      decoration: const InputDecoration(labelText: 'Tiêu đề tài liệu'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: contentCtrl,
                      maxLines: 10,
                      decoration: const InputDecoration(
                        labelText: 'Nội dung text',
                        hintText: 'Dán nội dung tài liệu học tập vào đây...',
                      ),
                    ),
                    if (err != null) ...[
                      const SizedBox(height: 10),
                      Text(err!, style: const TextStyle(color: Colors.red)),
                    ]
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: loading ? null : () => Navigator.pop(ctx),
                child: const Text('Hủy'),
              ),
              FilledButton(
                onPressed: loading
                    ? null
                    : () async {
                        setLocalState(() {
                          loading = true;
                          err = null;
                        });
                        try {
                          await widget.api.createAdminAiDocument(
                            title: titleCtrl.text.trim(),
                            content: contentCtrl.text.trim(),
                          );
                          if (!mounted) return;
                          Navigator.of(this.context).pop();
                          _reload();
                        } catch (e) {
                          setLocalState(() => err = '$e'.replaceFirst('Exception: ', ''));
                        } finally {
                          setLocalState(() => loading = false);
                        }
                      },
                child: Text(loading ? 'Đang lưu...' : 'Lưu'),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _openEditDialog(Map<String, dynamic> doc) async {
    final titleCtrl = TextEditingController(text: (doc['title'] ?? '').toString());
    final contentCtrl = TextEditingController(text: (doc['content'] ?? '').toString());
    bool loading = false;
    String? err;
    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setLocalState) => AlertDialog(
            title: const Text('Sửa tài liệu'),
            content: SizedBox(
              width: 520,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Tiêu đề')),
                    const SizedBox(height: 10),
                    TextField(
                      controller: contentCtrl,
                      maxLines: 10,
                      decoration: const InputDecoration(labelText: 'Nội dung'),
                    ),
                    if (err != null) ...[
                      const SizedBox(height: 10),
                      Text(err!, style: const TextStyle(color: Colors.red)),
                    ]
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(onPressed: loading ? null : () => Navigator.pop(ctx), child: const Text('Hủy')),
              FilledButton(
                onPressed: loading
                    ? null
                    : () async {
                        setLocalState(() {
                          loading = true;
                          err = null;
                        });
                        try {
                          await widget.api.updateAdminAiDocument(
                            id: (doc['id'] as num).toInt(),
                            title: titleCtrl.text.trim(),
                            content: contentCtrl.text.trim(),
                          );
                          if (!mounted) return;
                          Navigator.of(this.context).pop();
                          _reload();
                        } catch (e) {
                          setLocalState(() => err = '$e'.replaceFirst('Exception: ', ''));
                        } finally {
                          setLocalState(() => loading = false);
                        }
                      },
                child: Text(loading ? 'Đang lưu...' : 'Lưu'),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _uploadDocumentFile() async {
    final picked = await FilePicker.pickFiles(
      withData: true,
      type: FileType.custom,
      allowedExtensions: const ['txt', 'docx', 'pdf'],
    );
    if (picked == null || picked.files.isEmpty) return;
    final file = picked.files.single;
    if (file.bytes == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Không đọc được file đã chọn')),
      );
      return;
    }
    try {
      await widget.api.uploadAdminAiDocumentFile(
        bytes: file.bytes!,
        filename: file.name,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Upload tài liệu thành công')),
      );
      _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<dynamic>>(
      future: _futureDocs,
      builder: (_, snap) {
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final docs = snap.data!;
        return ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  onPressed: _openAddDialog,
                  icon: const Icon(Icons.add),
                  label: const Text('Thêm tài liệu text'),
                ),
                FilledButton.tonalIcon(
                  onPressed: _uploadDocumentFile,
                  icon: const Icon(Icons.upload_file),
                  label: const Text('Upload txt/docx/pdf'),
                ),
                OutlinedButton.icon(
                  onPressed: _reload,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Làm mới'),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (docs.isEmpty)
              const Padding(
                padding: EdgeInsets.all(20),
                child: Text('Chưa có tài liệu huấn luyện AI'),
              ),
            ...docs.map((d) => Card(
                  child: ListTile(
                    title: Text(d['title']?.toString() ?? 'Tài liệu'),
                    subtitle: Text(
                      'Người tạo: ${d['createdByName'] ?? d['createdBy'] ?? 'N/A'} • ${d['createdAt'] ?? ''}',
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit_outlined),
                          onPressed: () => _openEditDialog(d as Map<String, dynamic>),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, color: Colors.red),
                          onPressed: () async {
                            await widget.api.deleteAdminAiDocument((d['id'] as num).toInt());
                            _reload();
                          },
                        ),
                      ],
                    ),
                  ),
                )),
          ],
        );
      },
    );
  }
}

class AiChatbotScreen extends StatefulWidget {
  final ApiService api;
  const AiChatbotScreen({super.key, required this.api});

  @override
  State<AiChatbotScreen> createState() => _AiChatbotScreenState();
}

class _AiChatbotScreenState extends State<AiChatbotScreen> {
  final TextEditingController _input = TextEditingController();
  final List<Map<String, String>> _messages = [
    {
      'role': 'assistant',
      'text': 'Xin chào! Mình là AI học tập. Bạn có thể hỏi bài hoặc yêu cầu "giải chi tiết từng bước".'
    }
  ];
  bool _loading = false;

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _loading) return;
    setState(() {
      _messages.add({'role': 'user', 'text': text});
      _loading = true;
      _input.clear();
    });
    try {
      final r = await widget.api.askAiChatbot(text);
      setState(() {
        _messages.add({'role': 'assistant', 'text': (r['answer'] ?? '').toString()});
      });
    } catch (e) {
      setState(() {
        _messages.add({'role': 'assistant', 'text': 'Lỗi: ${'$e'.replaceFirst('Exception: ', '')}'});
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AI Chatbot học tập')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: _messages.length,
              itemBuilder: (_, i) {
                final msg = _messages[i];
                final isUser = msg['role'] == 'user';
                return Align(
                  alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(10),
                    constraints: const BoxConstraints(maxWidth: 540),
                    decoration: BoxDecoration(
                      color: isUser ? const Color(0xFFDDEBFF) : const Color(0xFFF1F1F6),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(msg['text'] ?? ''),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _input,
                    minLines: 1,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      hintText: 'Nhập câu hỏi, ví dụ: giải chi tiết câu phương trình bậc nhất...',
                    ),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: _loading ? null : _send,
                  icon: _loading
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send),
                  label: const Text('Gửi'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  final Map<String, dynamic> stats;
  const _StatsRow({required this.stats});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _StatCard(title: 'Lần thi', value: '${stats['totalAttempts']}')),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(title: 'ĐTB', value: '${stats['avgScore']}')),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(title: 'Cao nhất', value: '${stats['bestScore']}')),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  const _StatCard({required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(colors: [Color(0xFFE0E7FF), Color(0xFFD1F5FF)]),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          children: [
            Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            Text(title),
          ],
        ),
      ),
    );
  }
}

class _SubjectQuickTile extends StatelessWidget {
  final String title;
  final String imageUrl;
  final List<Color> colors;
  final VoidCallback onTap;
  const _SubjectQuickTile({
    required this.title,
    required this.imageUrl,
    required this.colors,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(colors: colors, begin: Alignment.topLeft, end: Alignment.bottomRight),
          boxShadow: const [BoxShadow(color: Color(0x29000000), blurRadius: 8, offset: Offset(0, 3))],
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Image.network(
                imageUrl,
                fit: BoxFit.cover,
                filterQuality: FilterQuality.high,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    colors.first.withValues(alpha: 0.35),
                    colors.last.withValues(alpha: 0.2),
                  ],
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.all(12),
              alignment: Alignment.topLeft,
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20),
              ),
            ),
            const Positioned(
              right: 10,
              bottom: 8,
              child: Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 30),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeatureTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _FeatureTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: const LinearGradient(
            colors: [Color(0xFFFFFFFF), Color(0xFFF3EEFF), Color(0xFFEEFAFF)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: ListTile(
          leading: CircleAvatar(
            backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
            child: Icon(icon, color: Theme.of(context).colorScheme.primary),
          ),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(subtitle),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      ),
    );
  }
}

class _RecommendationCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final VoidCallback onTap;
  const _RecommendationCard({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: const LinearGradient(
            colors: [Color(0xFFFFF7E8), Color(0xFFE7F6FF), Color(0xFFF0ECFF)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: ListTile(
          title: Text(item['title'], style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(
            '${item['subject']} • ${uiDifficultyFromApi(item['difficulty']?.toString() ?? '')} • ${item['questionCount']} câu',
          ),
          trailing: FilledButton.tonalIcon(
            onPressed: onTap,
            icon: const Icon(Icons.play_arrow_rounded),
            label: const Text('Làm ngay'),
          ),
        ),
      ),
    );
  }
}
